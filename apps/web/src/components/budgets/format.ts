/** Whole-unit amount in the budget's currency, e.g. ₹10,000 */
export function formatBudgetAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

/** Move a YYYY-MM month forward or back */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNum] = month.split('-').map(Number)
  return new Date(Date.UTC(year!, monthNum! - 1 + delta, 1)).toISOString().substring(0, 7)
}

/** e.g. "October 2026" */
export function monthTitle(month: string): string {
  const [year, monthNum] = month.split('-').map(Number)
  return new Date(year!, monthNum! - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

export interface MonthPace {
  /** Whether `month` is the month we're in now */
  isCurrent: boolean
  /** Share of the month already gone, 0-100 (100 for past months) */
  percentElapsed: number
  /** Days left including today (0 for past months) */
  daysLeft: number
}

/** How far through `month` we are */
export function getMonthPace(month: string, today: Date = new Date()): MonthPace {
  const [year, monthNum] = month.split('-').map(Number)
  const isCurrent = today.getFullYear() === year && today.getMonth() + 1 === monthNum
  if (!isCurrent) {
    const isFuture = new Date(year!, monthNum! - 1, 1) > today
    return { isCurrent, percentElapsed: isFuture ? 0 : 100, daysLeft: 0 }
  }
  const daysInMonth = new Date(year!, monthNum!, 0).getDate()
  return {
    isCurrent,
    percentElapsed: (today.getDate() / daysInMonth) * 100,
    daysLeft: daysInMonth - today.getDate() + 1,
  }
}

/** First and last day of a YYYY-MM month, for the transactions page filters */
export function monthRangeOf(month: string): { startDate: string; endDate: string } {
  const [year, monthNum] = month.split('-').map(Number)
  const lastDay = new Date(year!, monthNum!, 0).getDate()
  return { startDate: `${month}-01`, endDate: `${month}-${String(lastDay).padStart(2, '0')}` }
}
