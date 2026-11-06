import { and, asc, eq } from 'drizzle-orm'
import { db, tables, dbType } from '../db'
import type { Budget as BudgetRow } from '../db'
import { getCategoriesForCountry, type CountryCode } from '../lib/constants'
import {
  computeBudgetMonths,
  computeBudgetProgress,
  monthRange,
  monthsBetween,
  previousMonth,
  summarizeBudgetMonths,
  TOTAL_BUDGET_CATEGORY,
  type BudgetCategoryHistory,
  type BudgetMonth,
  type BudgetProgress,
  type Month,
} from '../lib/budgets'
import { categoryLabel } from './spending-changes'
import {
  computeTotals,
  dailyCategoryTotals,
  dailyTotals,
  loadTotalsTransactions,
  type TotalsResult,
  type TotalsTransaction,
} from './transaction-totals'
import { findUserById } from './user'

/**
 * Budgets service
 * A budget is a monthly spending limit for one expense category of a profile.
 * Spending comes from the transaction totals, so nothing is entered twice.
 */

export interface Budget {
  id: string
  profileId: string
  category: string
  categoryLabel: string
  monthlyAmount: number
  rollover: boolean
  createdAt: string
}

export interface BudgetInput {
  category: string
  monthlyAmount: number
  rollover?: boolean
}

export interface BudgetWithProgress extends Budget, BudgetProgress {}

export interface BudgetSummary {
  month: Month
  currency: string
  budgets: BudgetWithProgress[]
  /**
   * The overall budget for the month, if one is set. It counts all spending, including
   * categories that have a budget of their own.
   */
  totalBudget: BudgetWithProgress | null
  /** The overall budget's figures when there is one, otherwise sums across the category budgets */
  totalAvailable: number
  totalSpent: number
  /** Spending on each day (budgeted categories only, unless there is an overall budget) of the month, the 1st first */
  daily: number[]
  /** The same days split by category, biggest first, counting the same spending as `daily` */
  dailyCategories: Array<
    Array<{ category: string; categoryLabel: string; amount: number; count: number }>
  >
  /** The same for the month before, to compare against */
  previousDaily: number[]
}

export interface BudgetRangeSummary {
  startMonth: Month
  endMonth: Month
  currency: string
  /** How many budgets the profile has, so "none set" can be told from "nothing in this range yet" */
  budgetCount: number
  /** Each month of the range with budgets, oldest first (future months are left out) */
  months: BudgetMonth[]
  /** Months in `months`, and how many of them stayed within budget (the current one by what is spent so far) */
  monthCount: number
  monthsWithinBudget: number
  /** Worst first: most months over budget, then the most money over */
  categories: (BudgetCategoryHistory & { categoryLabel: string })[]
  totalAvailable: number
  totalSpent: number
}

/** Thrown when a budget fails validation; routes turn it into a 400 */
export class BudgetValidationError extends Error {}

function toBudget(row: BudgetRow): Budget {
  return {
    id: row.id,
    profileId: row.profileId,
    category: row.category,
    categoryLabel:
      row.category === TOTAL_BUDGET_CATEGORY ? 'Total Spending' : categoryLabel(row.category),
    monthlyAmount: Number(row.monthlyAmount),
    rollover: row.rollover,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  }
}

/** Postgres decimals expect strings */
function toDbAmount(value: number): string {
  return (dbType === 'postgres' ? String(value) : value) as string
}

/** Timestamp in the form the active database stores */
function now(): Date {
  return (dbType === 'postgres' ? new Date() : new Date().toISOString()) as unknown as Date
}

async function validateInput(userId: string, input: Partial<BudgetInput>): Promise<void> {
  if (input.monthlyAmount !== undefined && !(input.monthlyAmount > 0)) {
    throw new BudgetValidationError('The monthly amount must be more than zero')
  }
  if (input.category !== undefined && input.category !== TOTAL_BUDGET_CATEGORY) {
    const user = await findUserById(userId)
    const countryCode = (user?.country || 'US') as CountryCode
    const category = getCategoriesForCountry(countryCode).find((c) => c.code === input.category)
    if (!category || category.kind !== 'expense') {
      throw new BudgetValidationError('Budgets can only be set for spending categories')
    }
  }
}

/**
 * The overall budget has to cover the category budgets: it can't be set below their sum,
 * and a category budget can't push their sum past it. `change` is the budget being saved.
 */
async function assertTotalCoversCategories(
  userId: string,
  profileId: string,
  change: { id?: string; category: string; monthlyAmount: number }
): Promise<void> {
  const others = (await listBudgets(userId, profileId)).filter((b) => b.id !== change.id)
  const categoryAmounts = others.filter((b) => b.category !== TOTAL_BUDGET_CATEGORY)
  let total = others.find((b) => b.category === TOTAL_BUDGET_CATEGORY)?.monthlyAmount ?? null
  let categorySum = categoryAmounts.reduce((sum, b) => sum + b.monthlyAmount, 0)

  if (change.category === TOTAL_BUDGET_CATEGORY) total = change.monthlyAmount
  else categorySum += change.monthlyAmount

  if (total !== null && categorySum > total) {
    throw new BudgetValidationError(
      change.category === TOTAL_BUDGET_CATEGORY
        ? `The total budget can't be less than the ${categorySum} set across categories`
        : `Category budgets add up to ${categorySum}, more than the total budget of ${total}`
    )
  }
}

async function listBudgets(userId: string, profileId: string): Promise<Budget[]> {
  const rows = await db
    .select()
    .from(tables.budgets)
    .where(and(eq(tables.budgets.userId, userId), eq(tables.budgets.profileId, profileId)))
    .orderBy(asc(tables.budgets.createdAt))
  return rows.map(toBudget)
}

/**
 * Every budget of a profile with how much of it is used in `month`
 */
export async function getBudgetSummary(
  userId: string,
  profileId: string,
  month: Month
): Promise<BudgetSummary> {
  const allBudgets = await listBudgets(userId, profileId)
  const budgets = allBudgets.filter((b) => b.category !== TOTAL_BUDGET_CATEGORY)
  const totalBudget = allBudgets.find((b) => b.category === TOTAL_BUDGET_CATEGORY)
  const previous = previousMonth(month)
  const budgeted = new Set(budgets.map((b) => b.category))

  // Last month is loaded for rollovers and for the comparison with this month
  const load = (m: Month) =>
    loadTotalsTransactions(userId, { profileId, kind: 'expense', ...monthRange(m) })
  const [current, last] = await Promise.all([load(month), load(previous)])
  const byCategory = (transactions: TotalsTransaction[]) =>
    computeTotals(transactions, { kind: 'expense', groupBy: 'category' })
  const currentTotals = byCategory(current.transactions)
  const lastTotals = byCategory(last.transactions)
  // With an overall budget, every day's spending counts, not just the budgeted categories
  const counted = (transactions: TotalsTransaction[]) =>
    totalBudget ? transactions : transactions.filter((t) => budgeted.has(t.category))
  const dailyFor = (transactions: TotalsTransaction[], m: Month) =>
    dailyTotals(counted(transactions), 'expense', monthRange(m))

  const spentIn = (result: TotalsResult, category: string): number =>
    result.groups.find((g) => g.key === category)?.total ?? 0

  const progressFor = (
    budget: Budget,
    spent: number,
    previousSpent: number
  ): BudgetWithProgress => {
    // Last month only counts when the budget already existed then
    const existedLastMonth = budget.createdAt.substring(0, 7) <= previous
    return {
      ...budget,
      ...computeBudgetProgress(budget, spent, existedLastMonth ? previousSpent : null),
    }
  }
  const withProgress = budgets.map((budget) =>
    progressFor(
      budget,
      spentIn(currentTotals, budget.category),
      spentIn(lastTotals, budget.category)
    )
  )

  const totalBudgetProgress = totalBudget
    ? progressFor(totalBudget, currentTotals.total, lastTotals.total)
    : null

  return {
    month,
    currency: current.currency,
    budgets: withProgress,
    totalBudget: totalBudgetProgress,
    // With an overall budget the totals are its figures for all spending
    totalAvailable:
      totalBudgetProgress?.available ?? withProgress.reduce((sum, b) => sum + b.available, 0),
    totalSpent: totalBudgetProgress?.spent ?? withProgress.reduce((sum, b) => sum + b.spent, 0),
    daily: dailyFor(current.transactions, month),
    dailyCategories: dailyCategoryTotals(
      counted(current.transactions),
      'expense',
      monthRange(month)
    ).map((day) =>
      day.map((entry) => ({ ...entry, categoryLabel: categoryLabel(entry.category) }))
    ),
    previousDaily: dailyFor(last.transactions, previous),
  }
}

/**
 * How the profile's budgets held up month by month from `startMonth` to `endMonth`.
 * Each month is its own budget period, so a range is the months added up, not one big budget.
 */
export async function getBudgetRangeSummary(
  userId: string,
  profileId: string,
  startMonth: Month,
  endMonth: Month
): Promise<BudgetRangeSummary> {
  const allBudgets = await listBudgets(userId, profileId)
  const budgets = allBudgets.filter((b) => b.category !== TOTAL_BUDGET_CATEGORY)
  const totalBudget = allBudgets.find((b) => b.category === TOTAL_BUDGET_CATEGORY)

  // One load for the whole range plus the month before it, which rollovers need
  const { transactions, currency } = await loadTotalsTransactions(userId, {
    profileId,
    kind: 'expense',
    startDate: monthRange(previousMonth(startMonth)).startDate,
    endDate: monthRange(endMonth).endDate,
  })
  const byMonth = new Map<Month, TotalsTransaction[]>()
  for (const txn of transactions) {
    const month = txn.date.substring(0, 7)
    byMonth.set(month, [...(byMonth.get(month) ?? []), txn])
  }
  const spentCache = new Map<Month, TotalsResult>()
  const totalsOf = (month: Month): TotalsResult => {
    let totals = spentCache.get(month)
    if (!totals) {
      totals = computeTotals(byMonth.get(month) ?? [], { kind: 'expense', groupBy: 'category' })
      spentCache.set(month, totals)
    }
    return totals
  }
  const spentIn = (month: Month, category: string): number =>
    totalsOf(month).groups.find((g) => g.key === category)?.total ?? 0

  const months = computeBudgetMonths(
    budgets.map((b) => ({ ...b, createdMonth: b.createdAt.substring(0, 7) })),
    monthsBetween(startMonth, endMonth),
    spentIn,
    new Date().toISOString().substring(0, 7),
    totalBudget
      ? {
          budget: { ...totalBudget, createdMonth: totalBudget.createdAt.substring(0, 7) },
          spentIn: (month) => totalsOf(month).total,
        }
      : null
  )
  const { monthCount, monthsWithinBudget, categories } = summarizeBudgetMonths(months)

  return {
    startMonth,
    endMonth,
    currency,
    budgetCount: allBudgets.length,
    months,
    monthCount,
    monthsWithinBudget,
    categories: categories.map((c) => ({ ...c, categoryLabel: categoryLabel(c.category) })),
    totalAvailable: months.reduce((sum, m) => sum + m.totalAvailable, 0),
    totalSpent: months.reduce((sum, m) => sum + m.totalSpent, 0),
  }
}

/** Whether this error is the unique-index failure for a second budget in the same category */
function isDuplicate(error: unknown): boolean {
  const text = `${error instanceof Error ? error.message : ''} ${(error as { cause?: Error })?.cause?.message ?? ''}`
  return /unique|duplicate/i.test(text)
}

export async function createBudget(
  userId: string,
  profileId: string,
  input: BudgetInput
): Promise<Budget> {
  await validateInput(userId, input)
  await assertTotalCoversCategories(userId, profileId, input)
  try {
    const [row] = await db
      .insert(tables.budgets)
      .values({
        userId,
        profileId,
        category: input.category,
        monthlyAmount: toDbAmount(input.monthlyAmount),
        rollover: input.rollover ?? false,
      })
      .returning()
    return toBudget(row!)
  } catch (error) {
    if (isDuplicate(error)) {
      throw new BudgetValidationError('There is already a budget for this category')
    }
    throw error
  }
}

/** Change a budget's amount or rollover; null if it isn't the user's */
export async function updateBudget(
  userId: string,
  budgetId: string,
  input: Partial<Pick<BudgetInput, 'monthlyAmount' | 'rollover'>>
): Promise<Budget | null> {
  await validateInput(userId, input)
  if (input.monthlyAmount !== undefined) {
    const [existing] = await db
      .select()
      .from(tables.budgets)
      .where(and(eq(tables.budgets.id, budgetId), eq(tables.budgets.userId, userId)))
    if (!existing) return null
    await assertTotalCoversCategories(userId, existing.profileId, {
      id: budgetId,
      category: existing.category,
      monthlyAmount: input.monthlyAmount,
    })
  }
  const [row] = await db
    .update(tables.budgets)
    .set({
      ...(input.monthlyAmount !== undefined && { monthlyAmount: toDbAmount(input.monthlyAmount) }),
      ...(input.rollover !== undefined && { rollover: input.rollover }),
      updatedAt: now(),
    })
    .where(and(eq(tables.budgets.id, budgetId), eq(tables.budgets.userId, userId)))
    .returning()
  return row ? toBudget(row) : null
}

export async function deleteBudget(userId: string, budgetId: string): Promise<boolean> {
  const rows = await db
    .delete(tables.budgets)
    .where(and(eq(tables.budgets.id, budgetId), eq(tables.budgets.userId, userId)))
    .returning({ id: tables.budgets.id })
  return rows.length > 0
}
