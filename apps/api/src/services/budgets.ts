import { and, asc, eq } from 'drizzle-orm'
import { db, tables, dbType } from '../db'
import type { Budget as BudgetRow } from '../db'
import { getCategoriesForCountry, type CountryCode } from '../lib/constants'
import {
  computeBudgetProgress,
  monthRange,
  previousMonth,
  type BudgetProgress,
  type Month,
} from '../lib/budgets'
import { categoryLabel } from './spending-changes'
import { getTotals } from './transaction-totals'
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
  /** Sums across all budgets of the month */
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
    categoryLabel: categoryLabel(row.category),
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
  if (input.category !== undefined) {
    const user = await findUserById(userId)
    const countryCode = (user?.country || 'US') as CountryCode
    const category = getCategoriesForCountry(countryCode).find((c) => c.code === input.category)
    if (!category || category.kind !== 'expense') {
      throw new BudgetValidationError('Budgets can only be set for spending categories')
    }
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
  const budgets = await listBudgets(userId, profileId)
  const needsPrevious = budgets.some((b) => b.rollover)
  const previous = previousMonth(month)

  const totalsFor = (m: Month) =>
    getTotals(userId, { profileId, kind: 'expense', groupBy: 'category', ...monthRange(m) })
  const [current, last] = await Promise.all([
    totalsFor(month),
    needsPrevious ? totalsFor(previous) : undefined,
  ])

  const spentIn = (result: typeof current | undefined, category: string): number =>
    result?.groups.find((g) => g.key === category)?.total ?? 0

  const withProgress = budgets.map((budget) => {
    // Last month only counts when the budget already existed then
    const existedLastMonth = budget.createdAt.substring(0, 7) <= previous
    return {
      ...budget,
      ...computeBudgetProgress(
        budget,
        spentIn(current, budget.category),
        existedLastMonth ? spentIn(last, budget.category) : null
      ),
    }
  })

  return {
    month,
    currency: current.currency,
    budgets: withProgress,
    totalAvailable: withProgress.reduce((sum, b) => sum + b.available, 0),
    totalSpent: withProgress.reduce((sum, b) => sum + b.spent, 0),
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
