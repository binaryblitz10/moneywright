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
