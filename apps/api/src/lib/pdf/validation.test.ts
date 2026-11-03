import { describe, expect, test } from 'bun:test'
import {
  checkRunningBalance,
  isRealDate,
  isValidTransaction,
  validateParsedTransactions,
} from './validation'
import type { RawPdfTransaction } from './types'

describe('isRealDate', () => {
  test('accepts real dates, including leap days', () => {
    expect(isRealDate('2025-01-31')).toBe(true)
    expect(isRealDate('2024-02-29')).toBe(true)
  })

  test('rejects dates that do not exist', () => {
    expect(isRealDate('2025-02-30')).toBe(false)
    expect(isRealDate('2025-02-29')).toBe(false)
    expect(isRealDate('2025-04-31')).toBe(false)
    expect(isRealDate('2025-13-01')).toBe(false)
    expect(isRealDate('2025-00-10')).toBe(false)
    expect(isRealDate('2025-01-00')).toBe(false)
  })

  test('rejects the wrong format', () => {
    expect(isRealDate('25-01-10')).toBe(false)
    expect(isRealDate('2025-1-10')).toBe(false)
    expect(isRealDate('')).toBe(false)
  })
})

describe('isValidTransaction', () => {
  const base = { date: '2025-02-28', amount: 10, type: 'debit', description: 'x' }

  test('accepts a transaction with a real date', () => {
    expect(isValidTransaction(base)).toBe(true)
  })

  test('rejects a transaction dated 2025-02-30', () => {
    expect(isValidTransaction({ ...base, date: '2025-02-30' })).toBe(false)
  })
})

type Row = { type: 'credit' | 'debit'; amount: number; balance: number | null }

// Oldest first: 1000 -> +500 -> -200 -> -50 -> +100
const oldestFirst: Row[] = [
  { type: 'credit', amount: 500, balance: 1500 },
  { type: 'debit', amount: 200, balance: 1300 },
  { type: 'debit', amount: 50, balance: 1250 },
  { type: 'credit', amount: 100, balance: 1350 },
  { type: 'debit', amount: 25.5, balance: 1324.5 },
]

describe('checkRunningBalance', () => {
  test('accepts rows listed oldest first', () => {
    expect(checkRunningBalance(oldestFirst)).toEqual({
      checked: 4,
      breaks: 0,
      ok: true,
      firstBreakIndex: null,
    })
  })

  test('accepts rows listed newest first', () => {
    const result = checkRunningBalance([...oldestFirst].reverse())
    expect(result.ok).toBe(true)
    expect(result.breaks).toBe(0)
  })

  test('flags a break and reports where it is', () => {
    const rows = oldestFirst.map((r) => ({ ...r }))
    rows[2]!.balance = 1200
    const result = checkRunningBalance(rows)
    expect(result.ok).toBe(false)
    expect(result.breaks).toBeGreaterThan(0)
    expect(result.firstBreakIndex).not.toBeNull()
  })

  test('flipped debit/credit types break the balance', () => {
    const flipped = oldestFirst.map((r) => ({
      ...r,
      type: r.type === 'credit' ? ('debit' as const) : ('credit' as const),
    }))
    expect(checkRunningBalance(flipped).ok).toBe(false)
  })

  test('tolerates a cent of rounding', () => {
    const rows = oldestFirst.map((r) => ({ ...r }))
    rows[4]!.balance = 1324.51
    expect(checkRunningBalance(rows).ok).toBe(true)
  })

  test('is not checkable with fewer than three balances', () => {
    const result = checkRunningBalance(oldestFirst.slice(0, 2))
    expect(result.ok).toBe(false)
    expect(result.checked).toBeLessThan(3)
  })

  test('skips pairs where a balance is missing', () => {
    const rows = oldestFirst.map((r) => ({ ...r }))
    rows[2]!.balance = null
    const result = checkRunningBalance(rows)
    expect(result.checked).toBe(2)
    expect(result.breaks).toBe(0)
  })
})

function txn(row: Row, i: number): RawPdfTransaction {
  return { date: `2025-01-${String(i + 1).padStart(2, '0')}`, description: `row ${i}`, ...row }
}

describe('validateParsedTransactions', () => {
  const rows = oldestFirst.map(txn)
  const emptySummary = {
    debitCount: null,
    creditCount: null,
    totalDebits: null,
    totalCredits: null,
    openingBalance: null,
    closingBalance: null,
  }

  test('uses printed totals when the statement has them', () => {
    const ok = validateParsedTransactions(
      { ...emptySummary, debitCount: 3, creditCount: 2, totalDebits: 275.5, totalCredits: 600 },
      rows
    )
    expect(ok).toEqual({ passed: true, method: 'printed_totals', issues: [] })

    const bad = validateParsedTransactions({ ...emptySummary, debitCount: 4 }, rows)
    expect(bad.passed).toBe(false)
    expect(bad.method).toBe('printed_totals')
    expect(bad.issues[0]).toContain('Debit count')
  })

  test('compares balances only when both sides have one', () => {
    const result = validateParsedTransactions({ ...emptySummary, closingBalance: 5000 }, rows)
    expect(result.passed).toBe(false)
    expect(result.issues[0]).toContain('Closing balance')
  })

  test('falls back to the running balance without printed totals', () => {
    expect(validateParsedTransactions(null, rows)).toEqual({
      passed: true,
      method: 'running_balance',
      issues: [],
    })
    expect(validateParsedTransactions(emptySummary, rows).method).toBe('running_balance')
  })

  test('reports a running balance break', () => {
    const broken = rows.map((r) => ({ ...r }))
    broken[1]!.balance = 9999
    const result = validateParsedTransactions(null, broken)
    expect(result.passed).toBe(false)
    expect(result.method).toBe('running_balance')
    expect(result.issues).toHaveLength(1)
  })

  test('passes unchecked when there is nothing to check against', () => {
    const noBalances = rows.map((r) => ({ ...r, balance: null }))
    expect(validateParsedTransactions(null, noBalances)).toEqual({
      passed: true,
      method: 'none',
      issues: [],
    })
  })
})
