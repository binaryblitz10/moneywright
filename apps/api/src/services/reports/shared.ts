import { and, eq, min } from 'drizzle-orm'
import { db, tables } from '../../db'
import type { CategoryKind } from '../../lib/constants'
import { getPreviousPeriod } from '../cashflow'
import { getDataStartMonth, shiftMonth } from '../spending-changes'
import { getTransactions } from '../transactions'
import { accountKind } from '../data-health'
import type { AccountResponse } from '../accounts'
import type { TotalsGroup, TotalsTransaction } from '../transaction-totals'

/**
 * Shared helpers for the Reports section
 * Periods are always whole calendar months (one month or consecutive months), compared
 * with the same number of whole months just before, as long as every account has data there.
 */

/** YYYY-MM with a valid month number */
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

/** Upper bound on rows read for one report; far above any personal history */
const MAX_ROWS = 1_000_000

/** A transaction as needed by the reports */
export type ReportTransaction = TotalsTransaction

export interface ReportComparison {
  /** YYYY-MM */
  from: string
  /** YYYY-MM */
  to: string
  startDate: string
  endDate: string
  months: string[]
}

export interface ReportPeriod extends ReportComparison {
  /** Null when the comparison period starts before the data does */
  comparison: ReportComparison | null
}

export interface ReportBounds {
  /** First month that can be picked; null without any data */
  earliestMonth: string | null
  /** Latest complete month */
  lastCompleteMonth: string
  /** The month in progress; it can be picked and shows the data so far */
  currentMonth: string
}

/** A percentage change that can be absent */
export interface Change {
  delta: number
  /** Fraction; null when the previous value is 0 (shown as "New") */
  deltaPct: number | null
}

/** One row of a current-vs-previous table */
export interface ComparedRow {
  key: string
  label: string
  current: number
  /** Null without a comparison period */
  previous: number | null
  delta: number | null
  deltaPct: number | null
  count: number
  previousCount: number | null
}

/** Today as a local YYYY-MM-DD string */
export function localToday(): string {
  return new Date().toLocaleDateString('en-CA')
}

/** Every month from `from` to `to`, inclusive, chronological */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = []
  for (let month = from; month <= to; month = shiftMonth(month, 1)) months.push(month)
  return months
}

/** Last day of a YYYY-MM month as YYYY-MM-DD */
export function monthEndDate(month: string): string {
  const [year = 0, monthNum = 1] = month.split('-').map(Number)
  const lastDay = new Date(year, monthNum, 0).getDate()
  return `${month}-${String(lastDay).padStart(2, '0')}`
}

/** The latest month that is already over */
export function lastCompleteMonth(today: string): string {
  return shiftMonth(today.substring(0, 7), -1)
}

/** Change from `previous` to `current`; the percentage is absent when previous is 0 or less */
export function changeBetween(previous: number, current: number): Change {
  const delta = current - previous
  return { delta, deltaPct: previous > 0 ? delta / previous : null }
}

/**
 * Why a month range cannot be reported on, or null when it can
 */
export function validateMonthRange(from: string, to: string, bounds: ReportBounds): string | null {
  if (from > to) return 'from must not be after to'
  if (to > bounds.currentMonth) {
    return `The latest month you can pick is ${bounds.currentMonth}`
  }
  if (!bounds.earliestMonth || from < bounds.earliestMonth) {
    return bounds.earliestMonth
      ? `There is no data for every account before ${bounds.earliestMonth}`
      : 'There is no data yet'
  }
  return null
}

/**
 * The period and the comparison period just before it. No comparison when that period
 * would start before the first month with data from every account.
 */
export function resolvePeriod(
  from: string,
  to: string,
  earliestMonth: string | null
): ReportPeriod {
  const startDate = `${from}-01`
  const endDate = monthEndDate(to)
  const previous = getPreviousPeriod(startDate, endDate)
  const comparable = earliestMonth !== null && previous.startDate.substring(0, 7) >= earliestMonth
  const comparison: ReportComparison | null = comparable
    ? {
        from: previous.startDate.substring(0, 7),
        to: previous.endDate.substring(0, 7),
        startDate: previous.startDate,
        endDate: previous.endDate,
        months: monthsBetween(previous.startDate.substring(0, 7), previous.endDate.substring(0, 7)),
      }
    : null
  return { from, to, startDate, endDate, months: monthsBetween(from, to), comparison }
}

/**
 * Compare two sets of groups. Sorted by the current total, largest first; groups that only
 * existed in the previous period come last. Without previous groups there is no comparison.
 */
export function compareGroups(
  current: TotalsGroup[],
  previous: TotalsGroup[] | null
): ComparedRow[] {
  const rows = new Map<string, ComparedRow>()
  for (const group of current) {
    rows.set(group.key, {
      key: group.key,
      label: group.label,
      current: group.total,
      previous: previous ? 0 : null,
      delta: null,
      deltaPct: null,
      count: group.count,
      previousCount: previous ? 0 : null,
    })
  }
  for (const group of previous ?? []) {
    const row = rows.get(group.key) ?? {
      key: group.key,
      label: group.label,
      current: 0,
      previous: 0,
      delta: null,
      deltaPct: null,
      count: 0,
      previousCount: 0,
    }
    row.previous = group.total
    row.previousCount = group.count
    rows.set(group.key, row)
  }
  const result = [...rows.values()]
  for (const row of result) {
    if (row.previous === null) continue
    const change = changeBetween(row.previous, row.current)
    row.delta = change.delta
    row.deltaPct = change.deltaPct
  }
  return result.sort((a, b) => b.current - a.current)
}

/** Account details shown in report tables */
export interface ReportAccount {
  id: string
  name: string
  type: 'bank' | 'card' | 'other'
  last4: string | null
}

export function toReportAccount(account: AccountResponse): ReportAccount {
  const digits = account.accountNumber?.replace(/\D/g, '') ?? ''
  return {
    id: account.id,
    name: account.accountName || account.productName || account.institution || account.type,
    type: accountKind(account.type) ?? 'other',
    last4: digits.length >= 4 ? digits.slice(-4) : null,
  }
}

/** Month (YYYY-MM) of the first non-hidden transaction */
async function getFirstTransactionMonth(
  userId: string,
  profileId?: string
): Promise<string | null> {
  const conditions = [
    eq(tables.transactions.userId, userId),
    eq(tables.transactions.isHidden, false),
  ]
  if (profileId) conditions.push(eq(tables.transactions.profileId, profileId))
  const [row] = await db
    .select({ first: min(tables.transactions.date) })
    .from(tables.transactions)
    .where(and(...conditions))
  return row?.first ? row.first.substring(0, 7) : null
}

/** The months that can be picked */
export async function getReportBounds(
  userId: string,
  profileId?: string,
  today: string = localToday()
): Promise<ReportBounds> {
  const earliest =
    (await getDataStartMonth(userId, profileId)) ??
    (await getFirstTransactionMonth(userId, profileId))
  return {
    earliestMonth: earliest,
    lastCompleteMonth: lastCompleteMonth(today),
    currentMonth: today.substring(0, 7),
  }
}

/** Non-hidden transactions (optionally of one kind and/or date range) and the display currency */
export async function loadReportTransactions(
  userId: string,
  filters: { profileId?: string; startDate?: string; endDate?: string; kind?: CategoryKind }
): Promise<{ transactions: ReportTransaction[]; currency: string }> {
  const { transactions } = await getTransactions(userId, filters, { limit: MAX_ROWS })
  return { transactions, currency: transactions[0]?.currency || 'INR' }
}

/** Transactions dated within an inclusive range */
export function inRange<T extends { date: string }>(
  transactions: T[],
  range: { startDate: string; endDate: string }
): T[] {
  return transactions.filter((t) => t.date >= range.startDate && t.date <= range.endDate)
}
