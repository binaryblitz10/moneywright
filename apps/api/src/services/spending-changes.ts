import { and, eq, gte, inArray, lte, min, ne, sql } from 'drizzle-orm'
import { db, tables } from '../db'
import { MANUAL_DOCUMENT_TYPE } from '../lib/manual-statement'
import { getCategoryKind, TRANSACTION_CATEGORIES } from '../lib/constants'
import { getAccountsByUserId } from './accounts'
import { accountKind } from './data-health'
import { getCashflowExcludedCategories } from './preferences'

/**
 * Spending changes service
 * Compares a month's spending per category and merchant against the average of the
 * previous months, and flags unusually large transactions. All figures are computed
 * here so callers (dashboard, Penny) quote them instead of recomputing.
 */

/** Smallest absolute change worth reporting */
const MIN_CHANGE_AMOUNT = 3000
/** Smallest relative change worth reporting (fraction of the baseline average) */
const MIN_CHANGE_FRACTION = 0.25
/** Debits at or above this amount can be flagged as large transactions */
const LARGE_TXN_AMOUNT = 10000
/** Baseline months needed before a comparison is meaningful */
export const MIN_BASELINE_MONTHS = 3
export const DEFAULT_BASELINE_MONTHS = 3
export const MAX_BASELINE_MONTHS = 24

const MAX_CATEGORY_CHANGES = 8
const MAX_MERCHANT_CHANGES = 5
const MAX_LARGE_TRANSACTIONS = 5
const MAX_TOP_MERCHANTS = 3

/** A transaction as needed for change detection */
export interface ChangeTransaction {
  id: string
  /** YYYY-MM-DD */
  date: string
  type: 'credit' | 'debit'
  amount: number
  category: string
  summary: string | null
  originalDescription: string
}

export interface TopMerchant {
  merchant: string
  /** Transactions this month (debits and refunds) */
  count: number
  /** Net spend this month */
  amount: number
  /** This month's spend minus the merchant's average over the baseline */
  delta: number
}

export interface CategoryChange {
  category: string
  label: string
  current: number
  baselineAverage: number
  delta: number
  /** Null when the baseline average is 0 */
  deltaPct: number | null
  direction: 'up' | 'down'
  topMerchants: TopMerchant[]
}

export interface MerchantChange {
  merchant: string
  /** Category with the most spend for this merchant this month */
  category: string
  current: number
  baselineAverage: number
  delta: number
  deltaPct: number | null
  direction: 'up' | 'down'
}

export interface LargeTransaction {
  id: string
  date: string
  amount: number
  summary: string
  category: string
  reason: 'above_p95' | 'new_merchant'
}

export interface SpendingChangesOptions {
  /** YYYY-MM; defaults to the latest complete month with data */
  month?: string
  baselineMonths?: number
  /** YYYY-MM-DD, used to decide which month is still in progress */
  today: string
  excludeCategories?: string[]
  /** YYYY-MM; the first complete month of data across accounts. Earlier months are never baselines */
  dataStartMonth?: string
}

export interface InsufficientHistoryResult {
  status: 'insufficient_history'
  month: string
  isPartial: boolean
  /** Baseline months available before the target month (within the data range) */
  baselineMonthsAvailable: number
  baselineMonthsRequired: number
}

export interface SpendingChangesReport {
  status: 'ok'
  month: string
  /** True when the month is still in progress */
  isPartial: boolean
  /** Explains how a partial month is compared, null otherwise */
  note: string | null
  /** Baseline months actually used (YYYY-MM, chronological) */
  baselineMonths: string[]
  totals: {
    current: number
    baselineAverage: number
    delta: number
    deltaPct: number | null
  }
  categories: CategoryChange[]
  merchants: MerchantChange[]
  largeTransactions: LargeTransaction[]
}

export type SpendingChangesResult = SpendingChangesReport | InsufficientHistoryResult

/** API response: the result plus the display currency */
export type SpendingChangesResponse = SpendingChangesResult & { currency: string }

/** Average of a list of numbers; 0 for an empty list */
export function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/** Percentile (0-1) with linear interpolation; null for an empty list */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = (sorted.length - 1) * p
  const lower = Math.floor(rank)
  const upper = Math.ceil(rank)
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (rank - lower)
}

/** Title of a transaction: its saved name, falling back to the start of the bank description */
function transactionTitle(txn: Pick<ChangeTransaction, 'summary' | 'originalDescription'>): string {
  return (txn.summary?.trim() || txn.originalDescription.substring(0, 50)).trim()
}

/**
 * Merchant identity: the whole name, lowercased with whitespace collapsed. Falls back to
 * the original description. Matches subscription grouping.
 */
export function merchantKey(
  txn: Pick<ChangeTransaction, 'summary' | 'originalDescription'>
): string {
  return transactionTitle(txn).replace(/\s+/g, ' ').toLowerCase()
}

/** Display form of the merchant: the whole name as written */
export function merchantName(
  txn: Pick<ChangeTransaction, 'summary' | 'originalDescription'>
): string {
  return transactionTitle(txn)
}

/** Month (YYYY-MM) shifted by a number of months */
export function shiftMonth(month: string, delta: number): string {
  const [year = 0, mon = 1] = month.split('-').map(Number)
  const index = year * 12 + (mon - 1) + delta
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/**
 * Default target: the latest month with data that is already complete.
 * Falls back to the month before the current one when nothing qualifies.
 */
export function pickDefaultMonth(monthsWithData: string[], today: string): string {
  const currentMonth = today.substring(0, 7)
  const complete = monthsWithData.filter((m) => m < currentMonth).sort()
  return complete[complete.length - 1] ?? shiftMonth(currentMonth, -1)
}

/** Whether a change is big enough to report: >= max(3000, 25% of the average) */
export function isSignificantChange(current: number, baselineAverage: number): boolean {
  const delta = current - baselineAverage
  if (baselineAverage <= 0) return current >= MIN_CHANGE_AMOUNT
  return Math.abs(delta) >= Math.max(MIN_CHANGE_AMOUNT, MIN_CHANGE_FRACTION * baselineAverage)
}

function changePct(delta: number, baselineAverage: number): number | null {
  return baselineAverage > 0 ? delta / baselineAverage : null
}

/** Net spend (debits - credits) keyed by month then group key */
function sumByMonth(
  txns: ChangeTransaction[],
  groupKey: (txn: ChangeTransaction) => string
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>()
  for (const txn of txns) {
    const month = txn.date.substring(0, 7)
    const key = groupKey(txn)
    let byKey = result.get(month)
    if (!byKey) {
      byKey = new Map()
      result.set(month, byKey)
    }
    byKey.set(key, (byKey.get(key) ?? 0) + (txn.type === 'debit' ? txn.amount : -txn.amount))
  }
  return result
}

/** Baseline average per key; months without spend for a key count as 0 */
function baselineAverages(
  sums: Map<string, Map<string, number>>,
  baselineMonths: string[]
): Map<string, number> {
  const keys = new Set<string>()
  for (const month of baselineMonths) {
    for (const key of sums.get(month)?.keys() ?? []) keys.add(key)
  }
  const averages = new Map<string, number>()
  for (const key of keys) {
    averages.set(key, average(baselineMonths.map((month) => sums.get(month)?.get(key) ?? 0)))
  }
  return averages
}

const CATEGORY_LABELS = new Map<string, string>(
  [...TRANSACTION_CATEGORIES.IN, ...TRANSACTION_CATEGORIES.US].map(
    (c) => [c.code, c.label] as const
  )
)

export function categoryLabel(code: string): string {
  return CATEGORY_LABELS.get(code) ?? code.replace(/_/g, ' ')
}

/**
 * First usable baseline month: the first full calendar month on or after the LATEST of the
 * accounts' first statement dates. Earlier months only have part of the accounts' data.
 */
export function firstUsableMonth(firstStartDates: string[]): string | null {
  const latest = [...firstStartDates].sort().pop()
  if (!latest) return null
  const month = latest.substring(0, 7)
  return latest.substring(8, 10) === '01' ? month : shiftMonth(month, 1)
}

/**
 * Pure calculation - no DB access (unit tested)
 * `transactions` should cover at least the baseline window and the target month;
 * `monthsWithData` is every month the user has any transaction in (used for the default
 * month and as the data start when `options.dataStartMonth` is not given).
 */
export function computeSpendingChanges(
  transactions: ChangeTransaction[],
  monthsWithData: string[],
  options: SpendingChangesOptions
): SpendingChangesResult {
  const currentMonth = options.today.substring(0, 7)
  const month = options.month ?? pickDefaultMonth(monthsWithData, options.today)
  const isPartial = month >= currentMonth
  const wanted = options.baselineMonths ?? DEFAULT_BASELINE_MONTHS

  // Baseline: previous N months, but only those from the first usable month onwards
  const dataStart = options.dataStartMonth ?? [...monthsWithData].sort()[0] ?? month
  const baselineMonths: string[] = []
  for (let i = wanted; i >= 1; i--) {
    const m = shiftMonth(month, -i)
    if (m >= dataStart) baselineMonths.push(m)
  }

  if (baselineMonths.length < MIN_BASELINE_MONTHS) {
    return {
      status: 'insufficient_history',
      month,
      isPartial,
      baselineMonthsAvailable: baselineMonths.length,
      baselineMonthsRequired: MIN_BASELINE_MONTHS,
    }
  }

  const excluded = new Set(options.excludeCategories ?? [])
  const spending = transactions.filter(
    (txn) => getCategoryKind(txn.category) === 'expense' && !excluded.has(txn.category)
  )
  const baselineSet = new Set(baselineMonths)
  const current = spending.filter((txn) => txn.date.startsWith(month))
  const baseline = spending.filter((txn) => baselineSet.has(txn.date.substring(0, 7)))

  // Totals
  const monthlyTotals = sumByMonth(spending, () => 'total')
  const totalCurrent = monthlyTotals.get(month)?.get('total') ?? 0
  const totalAverage = average(baselineMonths.map((m) => monthlyTotals.get(m)?.get('total') ?? 0))

  // Categories
  const categorySums = sumByMonth(spending, (txn) => txn.category)
  const categoryAverages = baselineAverages(categorySums, baselineMonths)
  const currentByCategory = categorySums.get(month) ?? new Map<string, number>()

  // Merchants, overall and within each category (for the per-category drivers)
  const merchantSums = sumByMonth(spending, merchantKey)
  const merchantAverages = baselineAverages(merchantSums, baselineMonths)
  const currentByMerchant = merchantSums.get(month) ?? new Map<string, number>()
  const scopedKey = (txn: ChangeTransaction) => `${txn.category}\u0000${merchantKey(txn)}`
  const scopedSums = sumByMonth(spending, scopedKey)
  const scopedAverages = baselineAverages(scopedSums, baselineMonths)
  const currentScoped = scopedSums.get(month) ?? new Map<string, number>()

  const categoryKeys = new Set([...currentByCategory.keys(), ...categoryAverages.keys()])
  const categories: CategoryChange[] = []
  for (const category of categoryKeys) {
    const cur = currentByCategory.get(category) ?? 0
    const avg = categoryAverages.get(category) ?? 0
    if (!isSignificantChange(cur, avg)) continue
    const delta = cur - avg
    const direction = delta > 0 ? 'up' : 'down'

    const inCategory = current.filter((txn) => txn.category === category)
    const names = new Map<string, string>()
    const counts = new Map<string, number>()
    for (const txn of inCategory) {
      const key = merchantKey(txn)
      if (!names.has(key)) names.set(key, merchantName(txn))
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const drivers: Array<TopMerchant & { key: string }> = []
    const scopedKeys = new Set(
      [...currentScoped.keys(), ...scopedAverages.keys()].filter((k) =>
        k.startsWith(`${category}\u0000`)
      )
    )
    for (const sk of scopedKeys) {
      const key = sk.substring(category.length + 1)
      const amount = currentScoped.get(sk) ?? 0
      const merchantDelta = amount - (scopedAverages.get(sk) ?? 0)
      // Only merchants pushing in the same direction as the category explain the change
      if (direction === 'up' ? merchantDelta <= 0 : merchantDelta >= 0) continue
      // A merchant that vanished this month has no transactions to show
      const name = names.get(key)
      if (!name) continue
      drivers.push({
        key,
        merchant: name,
        count: counts.get(key) ?? 0,
        amount,
        delta: merchantDelta,
      })
    }
    drivers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

    categories.push({
      category,
      label: categoryLabel(category),
      current: cur,
      baselineAverage: avg,
      delta,
      deltaPct: changePct(delta, avg),
      direction,
      topMerchants: drivers
        .slice(0, MAX_TOP_MERCHANTS)
        .map(({ merchant, count, amount, delta: d }) => ({ merchant, count, amount, delta: d })),
    })
  }
  categories.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  // Merchant movers across all expense categories
  const merchantNames = new Map<string, string>()
  const categorySpendByMerchant = new Map<string, Map<string, number>>()
  for (const txn of current) {
    const key = merchantKey(txn)
    if (!merchantNames.has(key)) merchantNames.set(key, merchantName(txn))
    const byCat = categorySpendByMerchant.get(key) ?? new Map<string, number>()
    byCat.set(txn.category, (byCat.get(txn.category) ?? 0) + txn.amount)
    categorySpendByMerchant.set(key, byCat)
  }
  const merchants: MerchantChange[] = []
  for (const key of new Set([...currentByMerchant.keys(), ...merchantAverages.keys()])) {
    const cur = currentByMerchant.get(key) ?? 0
    const avg = merchantAverages.get(key) ?? 0
    if (!isSignificantChange(cur, avg)) continue
    const topCategory = [...(categorySpendByMerchant.get(key) ?? [])].sort((a, b) => b[1] - a[1])[0]
    const delta = cur - avg
    merchants.push({
      merchant: merchantNames.get(key) ?? key,
      category: topCategory?.[0] ?? '',
      current: cur,
      baselineAverage: avg,
      delta,
      deltaPct: changePct(delta, avg),
      direction: delta > 0 ? 'up' : 'down',
    })
  }
  merchants.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  // Large or unusual transactions
  const baselineDebitsByCategory = new Map<string, number[]>()
  const baselineMerchants = new Set<string>()
  for (const txn of baseline) {
    baselineMerchants.add(merchantKey(txn))
    if (txn.type !== 'debit') continue
    const list = baselineDebitsByCategory.get(txn.category) ?? []
    list.push(txn.amount)
    baselineDebitsByCategory.set(txn.category, list)
  }
  const largeTransactions: LargeTransaction[] = []
  for (const txn of current) {
    if (txn.type !== 'debit' || txn.amount < LARGE_TXN_AMOUNT) continue
    const p95 = percentile(baselineDebitsByCategory.get(txn.category) ?? [], 0.95)
    let reason: LargeTransaction['reason'] | null = null
    if (p95 !== null && txn.amount > p95) reason = 'above_p95'
    else if (!baselineMerchants.has(merchantKey(txn))) reason = 'new_merchant'
    if (!reason) continue
    largeTransactions.push({
      id: txn.id,
      date: txn.date,
      amount: txn.amount,
      summary: txn.summary?.trim() || txn.originalDescription,
      category: txn.category,
      reason,
    })
  }
  largeTransactions.sort((a, b) => b.amount - a.amount)

  const totalDelta = totalCurrent - totalAverage
  return {
    status: 'ok',
    month,
    isPartial,
    note: isPartial
      ? 'Month in progress: spending so far is compared with full previous months, without pro-rating.'
      : null,
    baselineMonths,
    totals: {
      current: totalCurrent,
      baselineAverage: totalAverage,
      delta: totalDelta,
      deltaPct: changePct(totalDelta, totalAverage),
    },
    categories: categories.slice(0, MAX_CATEGORY_CHANGES),
    merchants: merchants.slice(0, MAX_MERCHANT_CHANGES),
    largeTransactions: largeTransactions.slice(0, MAX_LARGE_TRANSACTIONS),
  }
}

/**
 * First complete month with data from every account (see firstUsableMonth); null without accounts.
 * Periods starting earlier only have part of the accounts' data, so they are never compared.
 */
export async function getDataStartMonth(
  userId: string,
  profileId?: string
): Promise<string | null> {
  return firstUsableMonth(await getAccountFirstStarts(userId, profileId))
}

/**
 * First YYYY-MM-DD each active bank/card account with statements has data from: its earliest
 * statement start, falling back to that statement's first transaction (then the account's
 * first transaction) when the period start is not stored.
 */
async function getAccountFirstStarts(userId: string, profileId?: string): Promise<string[]> {
  const accounts = (await getAccountsByUserId(userId, profileId)).filter(
    (a) => a.isActive && accountKind(a.type) !== null
  )
  const accountIds = accounts.map((a) => a.id)
  if (accountIds.length === 0) return []

  const [statementRows, statementFirstTxn, accountFirstTxn] = await Promise.all([
    db
      .select({
        id: tables.statements.id,
        accountId: tables.statements.accountId,
        periodStart: tables.statements.periodStart,
      })
      .from(tables.statements)
      .where(
        and(
          eq(tables.statements.userId, userId),
          eq(tables.statements.status, 'completed'),
          ne(tables.statements.documentType, MANUAL_DOCUMENT_TYPE),
          inArray(tables.statements.accountId, accountIds)
        )
      ),
    db
      .select({
        statementId: tables.transactions.statementId,
        first: min(tables.transactions.date),
      })
      .from(tables.transactions)
      .where(
        and(
          eq(tables.transactions.userId, userId),
          inArray(tables.transactions.accountId, accountIds)
        )
      )
      .groupBy(tables.transactions.statementId),
    db
      .select({ accountId: tables.transactions.accountId, first: min(tables.transactions.date) })
      .from(tables.transactions)
      .where(
        and(
          eq(tables.transactions.userId, userId),
          inArray(tables.transactions.accountId, accountIds)
        )
      )
      .groupBy(tables.transactions.accountId),
  ])

  const firstByStatement = new Map(statementFirstTxn.map((r) => [r.statementId, r.first]))
  const firstByAccount = new Map(accountFirstTxn.map((r) => [r.accountId, r.first]))
  const starts = new Map<string, string>()
  for (const s of statementRows) {
    if (!s.accountId) continue
    const start = s.periodStart ?? firstByStatement.get(s.id) ?? firstByAccount.get(s.accountId)
    const current = starts.get(s.accountId)
    if (start && (!current || start < current)) starts.set(s.accountId, start)
  }
  return [...starts.values()]
}

/**
 * Spending changes for a month against the average of previous months
 */
export async function getSpendingChanges(
  userId: string,
  options: { profileId?: string; month?: string; baselineMonths?: number; today?: string }
): Promise<SpendingChangesResponse> {
  const today = options.today ?? new Date().toLocaleDateString('en-CA')
  const baselineMonths = Math.min(
    Math.max(options.baselineMonths ?? DEFAULT_BASELINE_MONTHS, MIN_BASELINE_MONTHS),
    MAX_BASELINE_MONTHS
  )

  const conditions = [
    eq(tables.transactions.userId, userId),
    eq(tables.transactions.isHidden, false),
  ]
  if (options.profileId) {
    conditions.push(eq(tables.transactions.profileId, options.profileId))
  }

  const monthRows = await db
    .selectDistinct({ month: sql<string>`substr(${tables.transactions.date}, 1, 7)` })
    .from(tables.transactions)
    .where(and(...conditions))
  const monthsWithData = monthRows.map((r) => r.month)

  const month = options.month ?? pickDefaultMonth(monthsWithData, today)
  const startDate = `${shiftMonth(month, -baselineMonths)}-01`
  const endDate = `${month}-31`

  const rows = await db
    .select()
    .from(tables.transactions)
    .where(
      and(
        ...conditions,
        gte(tables.transactions.date, startDate),
        lte(tables.transactions.date, endDate)
      )
    )

  const result = computeSpendingChanges(
    rows.map((row) => ({
      id: row.id,
      date: row.date,
      type: row.type === 'credit' ? ('credit' as const) : ('debit' as const),
      amount: Number(row.amount),
      category: row.category,
      summary: row.summary,
      originalDescription: row.originalDescription,
    })),
    monthsWithData,
    {
      month,
      baselineMonths,
      today,
      dataStartMonth: (await getDataStartMonth(userId, options.profileId)) ?? undefined,
      excludeCategories: await getCashflowExcludedCategories(userId),
    }
  )

  return { ...result, currency: rows[0]?.currency || 'INR' }
}
