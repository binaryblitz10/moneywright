import { formatBudgetAmount, type MonthPace } from '../format'
import type { Budget, BudgetSummary } from '@/lib/api'

/** Status colours as CSS values, for charts and inline styles */
export const STATUS_COLOR: Record<Budget['status'], string> = {
  ok: 'var(--positive)',
  warning: 'var(--warning)',
  over: 'var(--negative)',
}

export interface GlanceStats {
  currency: string
  available: number
  spent: number
  /** Negative when over */
  remaining: number
  over: boolean
  percentUsed: number
  status: Budget['status']
  daysInMonth: number
  /** Days of the month gone, today included (all of them for past months) */
  daysElapsed: number
  /** Spending on each day of the month, the 1st first */
  daily: number[]
  /** Running total of spending for each day so far */
  cumulative: number[]
  /** Running total of last month's spending for each of its days */
  previousCumulative: number[]
  /** Where an even spend would be by today */
  expected: number
  /** Whether there was any spending last month to compare against */
  hasLastMonth: boolean
  avgPerDay: number
  /** Month-end spending if the daily average holds; null outside the current month */
  projected: number | null
  /** What can be spent each day and still finish within budget; null when over or not current */
  safePerDay: number | null
  /** An even share of the budget for one day */
  dailyBudget: number
  biggestDay: { day: number; amount: number } | null
  noSpendDays: number
  overCount: number
}

function runningTotal(values: number[]): number[] {
  let sum = 0
  return values.map((v) => (sum += v))
}

export function getGlanceStats(summary: BudgetSummary, pace: MonthPace): GlanceStats {
  const { budgets, currency, totalAvailable: available, totalSpent: spent, daily } = summary
  const remaining = available - spent
  const over = remaining < 0
  const percentUsed = available > 0 ? (spent / available) * 100 : 0
  const daysInMonth = daily.length
  const daysElapsed = pace.isCurrent
    ? daysInMonth - pace.daysLeft + 1
    : pace.percentElapsed === 0
      ? 0
      : daysInMonth

  const soFar = daily.slice(0, daysElapsed)
  const previousCumulative = runningTotal(summary.previousDaily)
  const avgPerDay = daysElapsed > 0 ? spent / daysElapsed : 0
  const biggest = soFar.reduce<GlanceStats['biggestDay']>(
    (best, amount, i) =>
      amount > 0 && amount > (best?.amount ?? 0) ? { day: i + 1, amount } : best,
    null
  )

  return {
    currency,
    available,
    spent,
    remaining,
    over,
    percentUsed,
    status: over ? 'over' : percentUsed >= 80 ? 'warning' : 'ok',
    daysInMonth,
    daysElapsed,
    daily,
    cumulative: runningTotal(soFar),
    previousCumulative,
    expected: (available * pace.percentElapsed) / 100,
    hasLastMonth: previousCumulative.at(-1)! > 0,
    avgPerDay,
    projected: pace.isCurrent ? avgPerDay * daysInMonth : null,
    safePerDay: pace.isCurrent && !over && pace.daysLeft > 0 ? remaining / pace.daysLeft : null,
    dailyBudget: daysInMonth > 0 ? available / daysInMonth : 0,
    biggestDay: biggest,
    noSpendDays: soFar.filter((amount) => amount <= 0).length,
    overCount: budgets.filter((b) => b.status === 'over').length,
  }
}

/** One-line verdict on the month, e.g. "Over budget with 2 days left" */
export function glanceHeadline(stats: GlanceStats, pace: MonthPace): string {
  const { over, remaining, currency, spent, expected } = stats
  const money = (amount: number) => formatBudgetAmount(amount, currency)
  if (!pace.isCurrent) {
    return over
      ? `Closed ${money(-remaining)} over budget`
      : `Closed ${money(remaining)} under budget`
  }
  if (over) return `Over budget with ${pace.daysLeft} ${pace.daysLeft === 1 ? 'day' : 'days'} left`
  const difference = spent - expected
  return difference > 0
    ? `${money(difference)} ahead of an even pace`
    : `${money(-difference)} behind an even pace, nice`
}

/** e.g. "Oct 12" for a day of a YYYY-MM month */
export function dayLabel(month: string, day: number): string {
  const [year, monthNum] = month.split('-').map(Number)
  return new Date(year!, monthNum! - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function plural(count: number, word: string): string {
  const many = /[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`
  return `${count} ${count === 1 ? word : many}`
}
