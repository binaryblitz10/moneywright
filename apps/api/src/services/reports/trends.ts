import { getAccountsByUserId } from '../accounts'
import { getCashflowExcludedCategories } from '../preferences'
import { getCategoryKind } from '../../lib/constants'
import { categoryLabel, merchantKey, merchantName } from '../spending-changes'
import { signedForKind } from '../transaction-totals'
import {
  loadReportTransactions,
  monthEndDate,
  monthsBetween,
  toReportAccount,
  type ReportAccount,
  type ReportTransaction,
} from './shared'

/**
 * Spending trends report
 * Expense spend (net of refunds, like the dashboard) month by month: by category, by shop
 * and by the account it went through.
 */

/** A shop's trend needs a change of at least this share of the earlier average... */
export const TREND_MIN_CHANGE_FRACTION = 0.2
/** ...and at least this much per month */
export const TREND_MIN_CHANGE_AMOUNT = 500

export type Trend = 'rising' | 'falling' | 'steady'

/** A row of the month-by-month tables; `months` lines up with the response's months */
export interface MonthlyRow {
  key: string
  label: string
  months: number[]
  total: number
  /** Total / number of months in the range */
  average: number
}

export interface AccountMonthlyRow extends MonthlyRow {
  type: ReportAccount['type']
  last4: string | null
}

export interface ShopTrendRow extends MonthlyRow {
  /** Debits, refunds not counted */
  payments: number
  /** Debits / payments; null without payments */
  averagePerPayment: number | null
  /** Null when the range is shorter than 2 months */
  trend: Trend | null
}

export interface TrendsData {
  /** YYYY-MM, chronological */
  months: string[]
  categories: MonthlyRow[]
  shops: ShopTrendRow[]
  accounts: AccountMonthlyRow[]
  /** Per month, all expenses */
  monthTotals: number[]
  total: number
  average: number
}

export interface TrendsResponse extends TrendsData {
  from: string
  to: string
  currency: string
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0)
}

/**
 * Pure calculation - no DB access (unit tested)
 * Later half of the months vs the earlier half (the middle month of an odd count is left
 * out). Rising or falling needs a change of 20% and 500 a month; null under 2 months.
 */
export function computeTrend(monthly: number[]): Trend | null {
  const half = Math.floor(monthly.length / 2)
  if (half < 1) return null
  const earlier = sum(monthly.slice(0, half)) / half
  const later = sum(monthly.slice(monthly.length - half)) / half
  const delta = later - earlier
  const significant =
    Math.abs(delta) >= TREND_MIN_CHANGE_AMOUNT &&
    Math.abs(delta) >= TREND_MIN_CHANGE_FRACTION * Math.max(earlier, 0)
  if (!significant) return 'steady'
  return delta > 0 ? 'rising' : 'falling'
}

interface Bucket {
  label: string
  months: number[]
  payments: number
  debits: number
}

/** Add a transaction's net expense to its group's month column */
function addTo(
  buckets: Map<string, Bucket>,
  key: string,
  label: string,
  monthIndex: number,
  monthCount: number,
  txn: ReportTransaction
): void {
  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { label, months: new Array<number>(monthCount).fill(0), payments: 0, debits: 0 }
    buckets.set(key, bucket)
  }
  bucket.months[monthIndex]! += signedForKind('expense', txn.type, txn.amount)
  if (txn.type === 'debit') {
    bucket.payments += 1
    bucket.debits += txn.amount
  }
}

/**
 * Pure calculation - no DB access (unit tested)
 * Only expense-kind transactions count; excluded categories are dropped. Rows are sorted
 * by total, largest first.
 */
export function computeTrends(input: {
  transactions: ReportTransaction[]
  months: string[]
  accounts: ReportAccount[]
  excludeCategories: string[]
}): TrendsData {
  const { months } = input
  const excluded = new Set(input.excludeCategories)
  const monthIndex = new Map(months.map((m, i) => [m, i] as const))
  const accountsById = new Map(input.accounts.map((a) => [a.id, a] as const))

  const categories = new Map<string, Bucket>()
  const shops = new Map<string, Bucket>()
  const accounts = new Map<string, Bucket>()

  for (const txn of input.transactions) {
    const index = monthIndex.get(txn.date.substring(0, 7))
    if (index === undefined) continue
    if (excluded.has(txn.category) || getCategoryKind(txn.category) !== 'expense') continue
    addTo(categories, txn.category, categoryLabel(txn.category), index, months.length, txn)
    addTo(shops, merchantKey(txn), merchantName(txn), index, months.length, txn)
    addTo(
      accounts,
      txn.accountId,
      accountsById.get(txn.accountId)?.name ?? 'Unknown account',
      index,
      months.length,
      txn
    )
  }

  const toRow = (key: string, bucket: Bucket): MonthlyRow => {
    const total = sum(bucket.months)
    return {
      key,
      label: bucket.label,
      months: bucket.months,
      total,
      average: months.length > 0 ? total / months.length : 0,
    }
  }
  const byTotal = <T extends { total: number }>(rows: T[]): T[] =>
    rows.sort((a, b) => b.total - a.total)

  const monthTotals = months.map((_, i) => sum([...categories.values()].map((b) => b.months[i]!)))
  const total = sum(monthTotals)

  return {
    months,
    categories: byTotal([...categories].map(([key, bucket]) => toRow(key, bucket))),
    shops: byTotal(
      [...shops].map(([key, bucket]) => ({
        ...toRow(key, bucket),
        payments: bucket.payments,
        averagePerPayment: bucket.payments > 0 ? bucket.debits / bucket.payments : null,
        trend: computeTrend(bucket.months),
      }))
    ),
    accounts: byTotal(
      [...accounts].map(([key, bucket]) => ({
        ...toRow(key, bucket),
        type: accountsById.get(key)?.type ?? 'other',
        last4: accountsById.get(key)?.last4 ?? null,
      }))
    ),
    monthTotals,
    total,
    average: months.length > 0 ? total / months.length : 0,
  }
}

/**
 * Spending trends for a range of complete months
 */
export async function getTrendsReport(
  userId: string,
  options: { profileId?: string; from: string; to: string }
): Promise<TrendsResponse> {
  const { profileId, from, to } = options
  const months = monthsBetween(from, to)
  const [loaded, accounts, excludeCategories] = await Promise.all([
    loadReportTransactions(userId, {
      profileId,
      startDate: `${from}-01`,
      endDate: monthEndDate(to),
    }),
    getAccountsByUserId(userId, profileId),
    getCashflowExcludedCategories(userId),
  ])

  return {
    ...computeTrends({
      transactions: loaded.transactions,
      months,
      accounts: accounts.map(toReportAccount),
      excludeCategories,
    }),
    from,
    to,
    currency: loaded.currency,
  }
}
