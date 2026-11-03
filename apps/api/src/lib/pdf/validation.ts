/**
 * Shared validation and normalization logic for PDF parsing
 *
 * Used by both local execution and E2B sandbox execution
 */

import type {
  RawPdfTransaction,
  RawInvestmentHolding,
  ExpectedSummary,
  ExtractedTotals,
} from './types'

/**
 * Maximum number of transactions/holdings to accept
 */
export const MAX_ITEMS = 50000

/**
 * Valid ISO currency codes we support
 */
export const VALID_CURRENCIES = new Set([
  'USD',
  'INR',
  'EUR',
  'GBP',
  'JPY',
  'AUD',
  'CAD',
  'SGD',
  'AED',
])

/**
 * Whether a string is a real calendar date in YYYY-MM-DD form (rejects 2025-02-30)
 */
export function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

/**
 * Validate a single transaction object
 */
export function isValidTransaction(txn: unknown): txn is RawPdfTransaction {
  if (typeof txn !== 'object' || txn === null) return false

  const t = txn as Record<string, unknown>

  if (typeof t.date !== 'string') return false
  if (typeof t.amount !== 'number' || isNaN(t.amount) || t.amount <= 0) return false
  if (t.type !== 'credit' && t.type !== 'debit') return false
  if (typeof t.description !== 'string') return false

  // Validate date format (YYYY-MM-DD) and that the date exists
  if (!isRealDate(t.date)) return false

  return true
}

/**
 * Normalize transaction (ensure consistent format)
 */
export function normalizeTransaction(txn: RawPdfTransaction): RawPdfTransaction {
  return {
    date: txn.date.trim(),
    amount: Math.abs(txn.amount),
    type: txn.type,
    description: txn.description.trim().slice(0, 500),
    balance: typeof txn.balance === 'number' ? txn.balance : null,
  }
}

/**
 * Validate a single investment holding object
 */
export function isValidHolding(holding: unknown): holding is RawInvestmentHolding {
  if (typeof holding !== 'object' || holding === null) return false

  const h = holding as Record<string, unknown>

  // Required fields
  if (typeof h.investment_type !== 'string' || h.investment_type.length === 0) return false
  if (typeof h.name !== 'string' || h.name.length === 0) return false
  if (typeof h.current_value !== 'number' || isNaN(h.current_value)) return false

  // units can be null for balance-based holdings (PPF, EPF, FD), or a number for unit-based
  if (h.units !== null && (typeof h.units !== 'number' || isNaN(h.units))) return false

  return true
}

/**
 * Normalize holding (ensure consistent format)
 */
export function normalizeHolding(h: RawInvestmentHolding): RawInvestmentHolding {
  // Normalize and validate currency
  let currency: string | null = null
  if (typeof h.currency === 'string') {
    const upperCurrency = h.currency.trim().toUpperCase()
    if (VALID_CURRENCIES.has(upperCurrency)) {
      currency = upperCurrency
    }
  }

  return {
    investment_type: h.investment_type.trim().toLowerCase(),
    symbol: typeof h.symbol === 'string' ? h.symbol.trim() || null : null,
    name: h.name.trim().slice(0, 500),
    isin: typeof h.isin === 'string' ? h.isin.trim() || null : null,
    units: typeof h.units === 'number' && !isNaN(h.units) ? h.units : null,
    average_cost:
      typeof h.average_cost === 'number' && !isNaN(h.average_cost) ? h.average_cost : null,
    current_price:
      typeof h.current_price === 'number' && !isNaN(h.current_price) ? h.current_price : null,
    current_value: h.current_value,
    invested_value:
      typeof h.invested_value === 'number' && !isNaN(h.invested_value) ? h.invested_value : null,
    folio_number: typeof h.folio_number === 'string' ? h.folio_number.trim() || null : null,
    maturity_date: typeof h.maturity_date === 'string' ? h.maturity_date.trim() || null : null,
    interest_rate:
      typeof h.interest_rate === 'number' && !isNaN(h.interest_rate) ? h.interest_rate : null,
    currency,
  }
}

/**
 * Tolerance for comparing printed statement totals (handles rounding differences)
 */
export const AMOUNT_TOLERANCE = 10

/** Tolerance for one running-balance step (balances are exact to the paisa/cent) */
const BALANCE_STEP_TOLERANCE = 0.01

/** Fewest consecutive balance steps that must hold before a statement counts as verified */
const MIN_BALANCE_STEPS = 3

export interface RunningBalanceCheck {
  /** Consecutive row pairs that both carry a balance */
  checked: number
  breaks: number
  /** Enough pairs were checked and every one held */
  ok: boolean
  /** Index (in the given row order) of the first row whose balance does not follow, or null */
  firstBreakIndex: number | null
}

interface BalanceRow {
  type: string
  amount: number
  balance?: number | null
}

/** Walk the rows in the given order and count steps where balance != previous balance +/- amount */
function walkBalances<T extends BalanceRow>(
  rows: T[]
): { checked: number; breaks: number; firstBreak: number | null } {
  let checked = 0
  let breaks = 0
  let firstBreak: number | null = null
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]!.balance
    const row = rows[i]!
    if (typeof prev !== 'number' || typeof row.balance !== 'number') continue
    checked++
    const expected = row.type === 'credit' ? prev + row.amount : prev - row.amount
    if (Math.abs(row.balance - expected) > BALANCE_STEP_TOLERANCE + 1e-9) {
      breaks++
      if (firstBreak === null) firstBreak = i
    }
  }
  return { checked, breaks, firstBreak }
}

/**
 * Self-check parsed rows against their printed running balance: each balance should equal the
 * previous balance plus a credit or minus a debit. Statements list rows oldest-first or
 * newest-first, so both orders are tried and the one with fewer breaks wins.
 */
export function checkRunningBalance(rows: BalanceRow[]): RunningBalanceCheck {
  const forward = walkBalances(rows)
  const reversedRows = [...rows].reverse()
  const backward = walkBalances(reversedRows)

  const useBackward = backward.breaks < forward.breaks
  const best = useBackward ? backward : forward
  const firstBreakIndex =
    best.firstBreak === null
      ? null
      : useBackward
        ? rows.length - 1 - best.firstBreak
        : best.firstBreak

  return {
    checked: best.checked,
    breaks: best.breaks,
    ok: best.checked >= MIN_BALANCE_STEPS && best.breaks === 0,
    firstBreakIndex,
  }
}

/** Whether the summary printed on the statement has anything to check against */
export function hasValidationData(summary: ExpectedSummary): boolean {
  return (
    summary.debitCount !== null ||
    summary.creditCount !== null ||
    summary.totalDebits !== null ||
    summary.totalCredits !== null ||
    summary.openingBalance !== null ||
    summary.closingBalance !== null
  )
}

/**
 * Totals of the parsed rows. Opening/closing balance come from the row balances when present
 * (closing = balance of the latest row, opening = balance of the earliest row before its amount).
 */
export function calculateTotals(transactions: RawPdfTransaction[]): ExtractedTotals {
  let debitCount = 0
  let creditCount = 0
  let totalDebits = 0
  let totalCredits = 0

  for (const txn of transactions) {
    if (txn.type === 'debit') {
      debitCount++
      totalDebits += txn.amount
    } else {
      creditCount++
      totalCredits += txn.amount
    }
  }

  let openingBalance: number | null = null
  let closingBalance: number | null = null

  const sortedByDate = transactions
    .filter((t) => t.balance != null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  if (sortedByDate.length > 0) {
    const first = sortedByDate[0]!
    const last = sortedByDate[sortedByDate.length - 1]!
    closingBalance = Math.round(last.balance! * 100) / 100
    const opening =
      first.type === 'credit' ? first.balance! - first.amount : first.balance! + first.amount
    openingBalance = Math.round(opening * 100) / 100
  }

  return {
    debitCount,
    creditCount,
    totalDebits: Math.round(totalDebits * 100) / 100,
    totalCredits: Math.round(totalCredits * 100) / 100,
    openingBalance,
    closingBalance,
  }
}

export interface ParsedValidation {
  passed: boolean
  method: 'printed_totals' | 'running_balance' | 'none'
  issues: string[]
}

/** Compare extracted totals with the printed summary; returns one issue per mismatch */
function compareToPrintedTotals(extracted: ExtractedTotals, expected: ExpectedSummary): string[] {
  const issues: string[] = []

  if (expected.debitCount !== null && extracted.debitCount !== expected.debitCount) {
    issues.push(
      `Debit count: extracted ${extracted.debitCount}, expected ${expected.debitCount} (diff: ${extracted.debitCount - expected.debitCount})`
    )
  }
  if (expected.creditCount !== null && extracted.creditCount !== expected.creditCount) {
    issues.push(
      `Credit count: extracted ${extracted.creditCount}, expected ${expected.creditCount} (diff: ${extracted.creditCount - expected.creditCount})`
    )
  }

  const amountChecks: Array<[string, number | null, number | null]> = [
    ['Total debits', extracted.totalDebits, expected.totalDebits],
    ['Total credits', extracted.totalCredits, expected.totalCredits],
    // Balances are only compared when both sides have one
    ['Opening balance', extracted.openingBalance, expected.openingBalance],
    ['Closing balance', extracted.closingBalance, expected.closingBalance],
  ]
  for (const [label, got, want] of amountChecks) {
    if (got === null || want === null) continue
    const diff = Math.abs(got - want)
    if (diff > AMOUNT_TOLERANCE) {
      issues.push(`${label}: extracted ${got}, expected ${want} (diff: ${diff.toFixed(2)})`)
    }
  }

  return issues
}

/**
 * Judge parsed rows the same way for fresh and cached parsers: against the totals printed on the
 * statement when there are any, otherwise against the running balance when the rows carry enough
 * of it, otherwise not at all (method 'none', passed).
 */
export function validateParsedTransactions(
  expected: ExpectedSummary | null,
  rows: RawPdfTransaction[]
): ParsedValidation {
  if (expected && hasValidationData(expected)) {
    const issues = compareToPrintedTotals(calculateTotals(rows), expected)
    return { passed: issues.length === 0, method: 'printed_totals', issues }
  }

  const balance = checkRunningBalance(rows)
  if (balance.ok) return { passed: true, method: 'running_balance', issues: [] }
  if (balance.checked >= MIN_BALANCE_STEPS && balance.breaks > 0) {
    const at = balance.firstBreakIndex !== null ? rows[balance.firstBreakIndex] : undefined
    const where = at
      ? `; first break at ${at.date} (${at.type} ${at.amount}, ${at.description.slice(0, 40)})`
      : ''
    return {
      passed: false,
      method: 'running_balance',
      issues: [
        `Running balance breaks in ${balance.breaks} of ${balance.checked} consecutive rows: each balance should equal the previous balance plus a credit or minus a debit${where}`,
      ],
    }
  }

  return { passed: true, method: 'none', issues: [] }
}
