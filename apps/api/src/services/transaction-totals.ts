import type { CategoryKind } from '../lib/constants'
import { getAccountsByUserId, type AccountResponse } from './accounts'
import { categoryLabel, merchantKey, merchantName } from './spending-changes'
import { getTransactions } from './transactions'

/**
 * Transaction totals service
 * Sums one kind of money (expense, income, investment or transfer) grouped by category,
 * merchant, month or account, and compares two periods. Signs match the dashboard:
 * income is credits - debits, everything else debits - credits (so refunds reduce spending).
 */

export type TotalsGroupBy = 'category' | 'merchant' | 'month' | 'account'

/** Grouping allowed when comparing periods (a month can't be in both periods) */
export type CompareGroupBy = Exclude<TotalsGroupBy, 'month'>

/** A transaction as needed for totals */
export interface TotalsTransaction {
  /** YYYY-MM-DD */
  date: string
  type: 'credit' | 'debit'
  amount: number
  category: string
  accountId: string
  summary: string | null
  originalDescription: string
}

export interface TotalsGroup {
  key: string
  label: string
  total: number
  count: number
}

export interface TotalsResult {
  total: number
  count: number
  /** Month groups are chronological; the rest are sorted by total, largest first */
  groups: TotalsGroup[]
}

/** Amount with the sign the dashboard uses for this kind */
export function signedForKind(
  kind: CategoryKind,
  type: 'credit' | 'debit',
  amount: number
): number {
  const credit = type === 'credit'
  if (kind === 'income') return credit ? amount : -amount
  return credit ? -amount : amount
}

/** e.g. "Oct 26", matching the dashboard's month labels */
function monthLabel(month: string): string {
  const [year, monthNum] = month.split('-').map(Number)
  return new Date(year!, monthNum! - 1, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
  })
}

/**
 * Pure calculation - no DB access (unit tested)
 * `transactions` must already be limited to the wanted kind.
 */
export function computeTotals(
  transactions: TotalsTransaction[],
  options: { kind: CategoryKind; groupBy: TotalsGroupBy; accountNames?: Map<string, string> }
): TotalsResult {
  const { kind, groupBy } = options
  const groups = new Map<string, TotalsGroup>()
  let total = 0

  for (const txn of transactions) {
    const amount = signedForKind(kind, txn.type, txn.amount)
    total += amount

    let key: string
    let label: string
    switch (groupBy) {
      case 'category':
        key = txn.category
        label = categoryLabel(txn.category)
        break
      case 'merchant':
        key = merchantKey(txn)
        label = merchantName(txn)
        break
      case 'month':
        key = txn.date.substring(0, 7)
        label = monthLabel(key)
        break
      case 'account':
        key = txn.accountId
        label = options.accountNames?.get(txn.accountId) ?? 'Unknown account'
        break
    }

    const group = groups.get(key)
    if (group) {
      group.total += amount
      group.count += 1
    } else {
      groups.set(key, { key, label, total: amount, count: 1 })
    }
  }

  const sorted = [...groups.values()].sort((a, b) =>
    groupBy === 'month' ? a.key.localeCompare(b.key) : b.total - a.total
  )

  return { total, count: transactions.length, groups: sorted }
}

export interface PeriodComparisonGroup {
  key: string
  label: string
  /** Total in period A */
  totalA: number
  /** Total in period B */
  totalB: number
  /** totalB - totalA */
  change: number
  /** change / totalA; null when totalA <= 0 */
  changePct: number | null
  countA: number
  countB: number
}

export interface PeriodComparison {
  totalA: number
  totalB: number
  change: number
  changePct: number | null
  countA: number
  countB: number
  /** Sorted by the size of the change, largest first */
  groups: PeriodComparisonGroup[]
}

function pctChange(from: number, to: number): number | null {
  return from > 0 ? (to - from) / from : null
}

/** Pure calculation - no DB access (unit tested). Change is always B - A. */
export function comparePeriodTotals(a: TotalsResult, b: TotalsResult): PeriodComparison {
  const byKey = new Map<string, PeriodComparisonGroup>()
  const blank = (group: TotalsGroup): PeriodComparisonGroup => ({
    key: group.key,
    label: group.label,
    totalA: 0,
    totalB: 0,
    change: 0,
    changePct: null,
    countA: 0,
    countB: 0,
  })

  for (const group of a.groups) {
    const row = blank(group)
    row.totalA = group.total
    row.countA = group.count
    byKey.set(group.key, row)
  }
  for (const group of b.groups) {
    const row = byKey.get(group.key) ?? blank(group)
    row.totalB = group.total
    row.countB = group.count
    byKey.set(group.key, row)
  }

  const groups = [...byKey.values()]
  for (const row of groups) {
    row.change = row.totalB - row.totalA
    row.changePct = pctChange(row.totalA, row.totalB)
  }
  groups.sort((x, y) => Math.abs(y.change) - Math.abs(x.change))

  return {
    totalA: a.total,
    totalB: b.total,
    change: b.total - a.total,
    changePct: pctChange(a.total, b.total),
    countA: a.count,
    countB: b.count,
    groups,
  }
}

/** Shared filters for totals and comparisons */
export interface TotalsFilters {
  profileId?: string
  kind: CategoryKind
  category?: string
  accountId?: string
  search?: string
}

/** Display name for an account: its name, product or institution, plus the last 4 digits */
function accountLabel(account: AccountResponse): string {
  const name = account.accountName || account.productName || account.institution || account.type
  const last4 = account.accountNumber?.replace(/\D/g, '').slice(-4)
  return last4 && !name.includes(last4) ? `${name} ••${last4}` : name
}

/** Upper bound on rows read for one total; far above any personal history */
const MAX_ROWS = 1_000_000

/** Load the period's transactions of one kind */
async function loadTotalsTransactions(
  userId: string,
  filters: TotalsFilters & { startDate?: string; endDate?: string }
): Promise<{ transactions: TotalsTransaction[]; currency: string }> {
  const { transactions } = await getTransactions(
    userId,
    {
      profileId: filters.profileId,
      kind: filters.kind,
      category: filters.category,
      accountId: filters.accountId,
      search: filters.search,
      startDate: filters.startDate,
      endDate: filters.endDate,
    },
    { limit: MAX_ROWS }
  )
  return { transactions, currency: transactions[0]?.currency || 'INR' }
}

async function getAccountNames(userId: string): Promise<Map<string, string>> {
  const accounts = await getAccountsByUserId(userId)
  return new Map(accounts.map((a) => [a.id, accountLabel(a)]))
}

/** Totals for one period grouped by category, merchant, month or account */
export async function getTotals(
  userId: string,
  options: TotalsFilters & { startDate?: string; endDate?: string; groupBy: TotalsGroupBy }
): Promise<TotalsResult & { currency: string }> {
  const [{ transactions, currency }, accountNames] = await Promise.all([
    loadTotalsTransactions(userId, options),
    options.groupBy === 'account' ? getAccountNames(userId) : undefined,
  ])
  return {
    ...computeTotals(transactions, { ...options, accountNames }),
    currency,
  }
}

/** A date range, both ends inclusive (YYYY-MM-DD) */
export interface DateRange {
  startDate: string
  endDate: string
}

/** Days in an inclusive date range */
export function daysInRange(range: DateRange): number {
  const ms = Date.parse(range.endDate) - Date.parse(range.startDate)
  return Math.round(ms / 86_400_000) + 1
}

/** Compare two periods' totals, grouped by category, merchant or account */
export async function comparePeriods(
  userId: string,
  options: TotalsFilters & { periodA: DateRange; periodB: DateRange; groupBy: CompareGroupBy }
): Promise<PeriodComparison & { currency: string }> {
  const [a, b, accountNames] = await Promise.all([
    loadTotalsTransactions(userId, { ...options, ...options.periodA }),
    loadTotalsTransactions(userId, { ...options, ...options.periodB }),
    options.groupBy === 'account' ? getAccountNames(userId) : undefined,
  ])
  const totalsOptions = { ...options, accountNames }
  return {
    ...comparePeriodTotals(
      computeTotals(a.transactions, totalsOptions),
      computeTotals(b.transactions, totalsOptions)
    ),
    currency: a.transactions.length > 0 ? a.currency : b.currency,
  }
}
