/**
 * Budget math - pure functions, no DB access (unit tested)
 */

/** A month as YYYY-MM */
export type Month = string

export interface BudgetLimit {
  monthlyAmount: number
  rollover: boolean
}

export interface BudgetProgress {
  /** The monthly limit */
  budget: number
  /** Unspent money carried over from last month (0 unless rollover is on) */
  carriedOver: number
  /** The limit for this month: budget plus anything carried over */
  available: number
  spent: number
  /** available - spent; negative when over the limit */
  remaining: number
  /** spent as a percentage of available, not capped */
  percentUsed: number
  status: 'ok' | 'warning' | 'over'
}

/** Show a warning once this share of the limit is used */
export const WARNING_PERCENT = 80

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export function isMonth(value: string): value is Month {
  return MONTH_PATTERN.test(value)
}

/** The month before `month` */
export function previousMonth(month: Month): Month {
  const [year, monthNum] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year!, monthNum! - 2, 1))
  return date.toISOString().substring(0, 7)
}

/** First and last day of a month, as YYYY-MM-DD */
export function monthRange(month: Month): { startDate: string; endDate: string } {
  const [year, monthNum] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year!, monthNum!, 0)).getUTCDate()
  return { startDate: `${month}-01`, endDate: `${month}-${String(lastDay).padStart(2, '0')}` }
}

/**
 * How much of a budget has been used.
 * `previousSpent` is last month's spending in the category, or null when the budget
 * didn't exist last month (nothing to carry over).
 */
export function computeBudgetProgress(
  limit: BudgetLimit,
  spent: number,
  previousSpent: number | null
): BudgetProgress {
  const carriedOver =
    limit.rollover && previousSpent !== null ? Math.max(0, limit.monthlyAmount - previousSpent) : 0
  const available = limit.monthlyAmount + carriedOver
  const percentUsed = available > 0 ? (spent / available) * 100 : spent > 0 ? 100 : 0
  return {
    budget: limit.monthlyAmount,
    carriedOver,
    available,
    spent,
    remaining: available - spent,
    percentUsed,
    status: spent > available ? 'over' : percentUsed >= WARNING_PERCENT ? 'warning' : 'ok',
  }
}

export interface RangeBudget extends BudgetLimit {
  category: string
  /** The month the budget was created in; nothing carries over into it from before */
  createdMonth: Month
}

export interface BudgetMonthEntry extends BudgetProgress {
  category: string
}

export interface BudgetMonth {
  month: Month
  /** The month we're in now: not over yet, so it isn't counted as a miss */
  inProgress: boolean
  entries: BudgetMonthEntry[]
  /** Sums across the month's budgets, with the status of the totals */
  totalAvailable: number
  totalSpent: number
  percentUsed: number
  status: BudgetProgress['status']
}

export interface BudgetCategoryHistory {
  category: string
  /** Completed months the budget existed in, and how many of them went over */
  monthsTracked: number
  monthsOver: number
  /** Money spent beyond the limit, summed over the months it went over */
  overBy: number
  /** Sums over every month of the range, the one in progress included */
  totalAvailable: number
  totalSpent: number
}

/** Every month from `start` to `end`, both included */
export function monthsBetween(start: Month, end: Month): Month[] {
  const months: Month[] = []
  for (let month = start; month <= end; ) {
    months.push(month)
    const [year, monthNum] = month.split('-').map(Number)
    month = new Date(Date.UTC(year!, monthNum!, 1)).toISOString().substring(0, 7)
  }
  return months
}

/**
 * Each month's budgets and how much of them was used.
 * Like the Budgets page, every budget applies to every month, whenever it was created;
 * only the rollover starts at its creation. Months after `currentMonth` are left out.
 */
export function computeBudgetMonths(
  budgets: RangeBudget[],
  months: Month[],
  spentIn: (month: Month, category: string) => number,
  currentMonth: Month
): BudgetMonth[] {
  const results: BudgetMonth[] = []
  for (const month of months) {
    if (month > currentMonth) continue
    const previous = previousMonth(month)
    const entries = budgets.map((budget) => ({
      category: budget.category,
      ...computeBudgetProgress(
        budget,
        spentIn(month, budget.category),
        // Last month only counts when the budget already existed then
        budget.createdMonth <= previous ? spentIn(previous, budget.category) : null
      ),
    }))
    if (entries.length === 0) continue

    const totalAvailable = entries.reduce((sum, e) => sum + e.available, 0)
    const totalSpent = entries.reduce((sum, e) => sum + e.spent, 0)
    const { percentUsed, status } = computeBudgetProgress(
      { monthlyAmount: totalAvailable, rollover: false },
      totalSpent,
      null
    )
    results.push({
      month,
      inProgress: month === currentMonth,
      entries,
      totalAvailable,
      totalSpent,
      percentUsed,
      status,
    })
  }
  return results
}

/** Months stayed within budget and, per category, how often it went over */
export function summarizeBudgetMonths(months: BudgetMonth[]): {
  completedMonths: number
  monthsWithinBudget: number
  categories: BudgetCategoryHistory[]
} {
  const completed = months.filter((m) => !m.inProgress)
  const history = new Map<string, BudgetCategoryHistory>()

  for (const month of months) {
    for (const entry of month.entries) {
      const row = history.get(entry.category) ?? {
        category: entry.category,
        monthsTracked: 0,
        monthsOver: 0,
        overBy: 0,
        totalAvailable: 0,
        totalSpent: 0,
      }
      row.totalAvailable += entry.available
      row.totalSpent += entry.spent
      if (!month.inProgress) {
        row.monthsTracked += 1
        if (entry.status === 'over') {
          row.monthsOver += 1
          row.overBy += entry.spent - entry.available
        }
      }
      history.set(entry.category, row)
    }
  }

  return {
    completedMonths: completed.length,
    monthsWithinBudget: completed.filter((m) => m.status !== 'over').length,
    // Worst first: most months over, then the most money over
    categories: [...history.values()].sort(
      (a, b) => b.monthsOver - a.monthsOver || b.overBy - a.overBy
    ),
  }
}
