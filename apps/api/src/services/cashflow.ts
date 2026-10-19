import { eq, and, gte, lte, desc } from 'drizzle-orm'
import { db, tables, type Transaction } from '../db'
import { getCategoryKind, type CategoryKind } from '../lib/constants'
import { getCashflowExcludedCategories } from './preferences'
import { toTransactionResponse, type TransactionResponse } from './transactions'

/**
 * Cash flow service
 * Single source for income, expense, invested and transfer totals across the app
 */

/** A transaction as needed for cash flow calculations */
export interface CashFlowTransaction {
  date: string
  type: 'credit' | 'debit'
  amount: number
  category: string
}

/** Per-category credits, debits and counts */
export interface CategoryCashFlow {
  category: string
  kind: CategoryKind
  credits: number
  debits: number
  net: number
  creditCount: number
  debitCount: number
  count: number
}

/** Totals by kind */
export interface CashFlowTotals {
  income: number
  expenses: number
  invested: number
  transferNet: number
  incomeCount: number
  expenseCount: number
  investmentCount: number
  transferCount: number
}

/** Cash flow totals for a single calendar month */
export interface MonthCashFlow extends CashFlowTotals {
  /** YYYY-MM */
  month: string
  /** e.g. "Jan 24" */
  monthLabel: string
  /** Largest expense category of the month; null when there are no expenses */
  topExpenseCategory: { category: string; total: number } | null
}

/** Full cash flow result */
export interface CashFlowResult extends CashFlowTotals {
  /** Sorted by absolute net, descending */
  byCategory: CategoryCashFlow[]
  /** Chronological; only months that have transactions; empty unless groupByMonth */
  months: MonthCashFlow[]
  excludedCategories: string[]
  /** First transaction's currency, default 'INR' */
  currency: string
}

/** Options for cash flow calculation */
export interface CashFlowOptions {
  profileId?: string
  /** YYYY-MM-DD inclusive */
  startDate?: string
  /** YYYY-MM-DD inclusive */
  endDate?: string
  groupByMonth?: boolean
  /** Defaults to the user's saved cashflow.excluded_categories */
  excludeCategories?: string[]
}

/**
 * Build totals from a set of per-category aggregates
 */
function buildTotals(categories: CategoryCashFlow[]): CashFlowTotals {
  const totals: CashFlowTotals = {
    income: 0,
    expenses: 0,
    invested: 0,
    transferNet: 0,
    incomeCount: 0,
    expenseCount: 0,
    investmentCount: 0,
    transferCount: 0,
  }

  for (const cat of categories) {
    switch (cat.kind) {
      case 'income':
        totals.income += cat.net
        totals.incomeCount += cat.count
        break
      case 'expense':
        totals.expenses += -cat.net
        totals.expenseCount += cat.count
        break
      case 'investment':
        totals.invested += -cat.net
        totals.investmentCount += cat.count
        break
      case 'transfer':
        totals.transferNet += -cat.net
        totals.transferCount += cat.count
        break
    }
  }

  return totals
}

/**
 * Aggregate transactions into per-category credits, debits and counts
 */
function aggregateCategories(transactions: CashFlowTransaction[]): CategoryCashFlow[] {
  const byCode = new Map<string, CategoryCashFlow>()

  for (const txn of transactions) {
    let cat = byCode.get(txn.category)
    if (!cat) {
      cat = {
        category: txn.category,
        kind: getCategoryKind(txn.category),
        credits: 0,
        debits: 0,
        net: 0,
        creditCount: 0,
        debitCount: 0,
        count: 0,
      }
      byCode.set(txn.category, cat)
    }

    if (txn.type === 'credit') {
      cat.credits += txn.amount
      cat.creditCount += 1
    } else {
      cat.debits += txn.amount
      cat.debitCount += 1
    }
  }

  for (const cat of byCode.values()) {
    cat.net = cat.credits - cat.debits
    cat.count = cat.creditCount + cat.debitCount
  }

  return [...byCode.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
}

/**
 * Pure calculation - no DB access (unit tested)
 * Income = credits - debits for income categories; expenses, invested and transfers
 * are debits - credits. Excluded categories are dropped entirely.
 */
export function computeCashFlow(
  transactions: CashFlowTransaction[],
  options?: { excludeCategories?: string[]; groupByMonth?: boolean }
): Omit<CashFlowResult, 'excludedCategories' | 'currency'> {
  const excluded = new Set(options?.excludeCategories ?? [])
  const included = transactions.filter((txn) => !excluded.has(txn.category))

  const byCategory = aggregateCategories(included)
  const months: MonthCashFlow[] = []

  if (options?.groupByMonth) {
    const byMonth = new Map<string, CashFlowTransaction[]>()
    for (const txn of included) {
      const month = txn.date.substring(0, 7)
      const bucket = byMonth.get(month)
      if (bucket) {
        bucket.push(txn)
      } else {
        byMonth.set(month, [txn])
      }
    }

    for (const month of [...byMonth.keys()].sort()) {
      const [year, monthNum] = month.split('-')
      const monthLabel = new Date(parseInt(year!), parseInt(monthNum!) - 1, 1).toLocaleDateString(
        'en-US',
        { month: 'short', year: '2-digit' }
      )
      const categories = aggregateCategories(byMonth.get(month)!)
      const top = categories
        .filter((cat) => cat.kind === 'expense' && cat.net < 0)
        .reduce<CategoryCashFlow | null>(
          (max, cat) => (!max || cat.net < max.net ? cat : max),
          null
        )
      months.push({
        month,
        monthLabel,
        ...buildTotals(categories),
        topExpenseCategory: top ? { category: top.category, total: -top.net } : null,
      })
    }
  }

  return { ...buildTotals(byCategory), byCategory, months }
}

/** Surplus and savings figures derived from income, expenses and invested */
export interface SavingsMetrics {
  /** income - expenses (investments are not expenses) */
  surplus: number
  /** surplus / income as a fraction; null when income <= 0 */
  savingsRate: number | null
  /** surplus - invested; negative means investing drew down existing cash */
  unallocated: number
}

/** Savings metrics for a period or month */
export function computeSavings(totals: {
  income: number
  expenses: number
  invested: number
}): SavingsMetrics {
  const surplus = totals.income - totals.expenses
  return {
    surplus,
    savingsRate: totals.income > 0 ? surplus / totals.income : null,
    unallocated: surplus - totals.invested,
  }
}

/** Last day of a YYYY-MM month as YYYY-MM-DD */
function monthLastDate(month: string): string {
  const [year, monthNum] = month.split('-').map(Number)
  const lastDay = new Date(year!, monthNum!, 0).getDate()
  return `${month}-${String(lastDay).padStart(2, '0')}`
}

/**
 * Whether a month is only partly covered because the range ends before its last day,
 * and if so the date it runs through. The range end is the requested end date capped
 * at today (a future end date such as a financial year end doesn't make a month whole).
 */
export function getMonthCoverage(
  month: string,
  rangeEnd: string | undefined,
  today: string = formatLocalDate(new Date())
): { isPartial: boolean; throughDate: string | null } {
  const end = rangeEnd && rangeEnd < today ? rangeEnd : today
  const isPartial = end < monthLastDate(month)
  return { isPartial, throughDate: isPartial ? end : null }
}

/** Month index (years * 12 + month) of a YYYY-MM-DD or YYYY-MM date */
function monthIndex(date: string): number {
  const [year = 0, month = 1] = date.split('-').map(Number)
  return year * 12 + month - 1
}

/** YYYY-MM of a month index */
function monthFromIndex(index: number): string {
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/**
 * The period just before a date range, in whole months: as many calendar months as the
 * range touches, ending the month before the range starts. Months always count in full,
 * so "this month" (part of October) compares with all of September.
 */
export function getPreviousPeriod(
  startDate: string,
  endDate: string
): { startDate: string; endDate: string } {
  const start = monthIndex(startDate)
  const months = Math.max(1, monthIndex(endDate) - start + 1)
  return {
    startDate: `${monthFromIndex(start - months)}-01`,
    endDate: monthLastDate(monthFromIndex(start - 1)),
  }
}

/** Map a stored transaction row to the shape used by cash flow calculations */
function toCashFlowTransaction(row: Transaction): CashFlowTransaction {
  return {
    date: row.date,
    type: row.type === 'credit' ? 'credit' : 'debit',
    amount: typeof row.amount === 'string' ? parseFloat(row.amount) : Number(row.amount),
    category: row.category,
  }
}

/** Non-hidden transactions matching the filters, newest first */
async function fetchTransactionRows(
  userId: string,
  filters: { profileId?: string; startDate?: string; endDate?: string }
): Promise<Transaction[]> {
  const conditions = [
    eq(tables.transactions.userId, userId),
    eq(tables.transactions.isHidden, false),
  ]

  if (filters.profileId) {
    conditions.push(eq(tables.transactions.profileId, filters.profileId))
  }
  if (filters.startDate) {
    conditions.push(gte(tables.transactions.date, filters.startDate))
  }
  if (filters.endDate) {
    conditions.push(lte(tables.transactions.date, filters.endDate))
  }

  return db
    .select()
    .from(tables.transactions)
    .where(and(...conditions))
    .orderBy(desc(tables.transactions.date))
}

/**
 * Income, expenses, invested and transfers for a period - the single source for every money widget
 */
export async function getCashFlow(
  userId: string,
  options?: CashFlowOptions
): Promise<CashFlowResult> {
  const rows = await fetchTransactionRows(userId, {
    profileId: options?.profileId,
    startDate: options?.startDate,
    endDate: options?.endDate,
  })

  const excludedCategories =
    options?.excludeCategories ?? (await getCashflowExcludedCategories(userId))

  const result = computeCashFlow(rows.map(toCashFlowTransaction), {
    excludeCategories: excludedCategories,
    groupByMonth: options?.groupByMonth,
  })

  return {
    ...result,
    excludedCategories,
    currency: rows[0]?.currency || 'INR',
  }
}

/**
 * Breakdown helper for routes: categories of one kind as { category, total, count }.
 * Total is sign-adjusted so income is net (credits - debits) and spending, invested
 * and transfers are debits - credits. Sorted by total descending.
 */
export function toBreakdown(
  byCategory: CategoryCashFlow[],
  kind: CategoryKind
): { category: string; total: number; count: number }[] {
  return byCategory
    .filter((cat) => cat.kind === kind)
    .map((cat) => ({
      category: cat.category,
      total: kind === 'income' ? cat.net : -cat.net,
      count: cat.count,
    }))
    .sort((a, b) => b.total - a.total)
}

/** Format a Date as a local YYYY-MM-DD string (avoids toISOString timezone shifts) */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Date range covering the last `months` calendar months: from the first day of the
 * (months - 1)-th month ago through today, as local YYYY-MM-DD strings
 */
export function getMonthsRange(months: number): { startDate: string; endDate: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)
  return { startDate: formatLocalDate(start), endDate: formatLocalDate(now) }
}

/** One month's transactions grouped by kind, with totals from getCashFlow */
export interface MonthCashFlowDetail {
  /** YYYY-MM */
  month: string
  /** e.g. "Jan 24" */
  monthLabel: string
  income: TransactionResponse[]
  expenses: TransactionResponse[]
  investments: TransactionResponse[]
  transfers: TransactionResponse[]
  totals: {
    income: number
    expenses: number
    invested: number
    transferNet: number
    /** income - expenses */
    net: number
  }
  incomeBreakdown: { category: string; total: number; count: number }[]
  categoryBreakdown: { category: string; total: number; count: number }[]
  excludedCategories: string[]
  currency: string
}

/** Options for a single month's cash flow detail */
export interface MonthCashFlowOptions {
  profileId?: string
  /** YYYY-MM */
  month: string
  /** Clips the month to this start date (YYYY-MM-DD) when later than month start */
  startDate?: string
  /** Clips the month to this end date (YYYY-MM-DD) when earlier than month end */
  endDate?: string
}

/**
 * Transactions for one month grouped by kind. Totals and breakdowns come from getCashFlow
 * over the same range, so they always match the other widgets.
 */
export async function getMonthCashFlow(
  userId: string,
  options: MonthCashFlowOptions
): Promise<MonthCashFlowDetail> {
  const [year, monthNum] = options.month.split('-').map(Number)
  const paddedMonth = String(monthNum).padStart(2, '0')
  const monthStart = `${year}-${paddedMonth}-01`
  const lastDay = new Date(year!, monthNum!, 0).getDate()
  const monthEnd = `${year}-${paddedMonth}-${String(lastDay).padStart(2, '0')}`

  const startDate =
    options.startDate && options.startDate > monthStart ? options.startDate : monthStart
  const endDate = options.endDate && options.endDate < monthEnd ? options.endDate : monthEnd

  const rows = await fetchTransactionRows(userId, {
    profileId: options.profileId,
    startDate,
    endDate,
  })
  const excludedCategories = await getCashflowExcludedCategories(userId)
  const excluded = new Set(excludedCategories)
  const cf = computeCashFlow(rows.map(toCashFlowTransaction), {
    excludeCategories: excludedCategories,
  })

  const grouped: Record<CategoryKind, TransactionResponse[]> = {
    income: [],
    expense: [],
    investment: [],
    transfer: [],
  }
  for (const row of rows) {
    if (excluded.has(row.category)) continue
    grouped[getCategoryKind(row.category)].push(toTransactionResponse(row))
  }

  const monthLabel = new Date(year!, monthNum! - 1, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
  })

  return {
    month: options.month,
    monthLabel,
    income: grouped.income,
    expenses: grouped.expense,
    investments: grouped.investment,
    transfers: grouped.transfer,
    totals: {
      income: cf.income,
      expenses: cf.expenses,
      invested: cf.invested,
      transferNet: cf.transferNet,
      net: cf.income - cf.expenses,
    },
    incomeBreakdown: toBreakdown(cf.byCategory, 'income'),
    categoryBreakdown: toBreakdown(cf.byCategory, 'expense'),
    excludedCategories,
    currency: rows[0]?.currency || 'INR',
  }
}
