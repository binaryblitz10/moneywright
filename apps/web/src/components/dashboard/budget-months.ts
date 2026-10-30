import { shiftMonth } from '@/components/budgets/format'
import { toLocalDateString } from './utils'
import type { DateRange } from './types'

/**
 * The first and last month of a date range that count as budget periods.
 * A month the range only clips doesn't: "Last 12 months" reaches back to the day after today's
 * date a year ago, so its oldest month has a single day in it. The month in progress always
 * counts, whatever day the range ends on, and a range inside one month keeps that month.
 */
export function getBudgetMonths(
  range: DateRange,
  today: Date = new Date()
): { startMonth: string; endMonth: string } {
  let startMonth = range.startDate.substring(0, 7)
  let endMonth = range.endDate.substring(0, 7)

  if (startMonth < endMonth && range.startDate.substring(8) !== '01') {
    startMonth = shiftMonth(startMonth, 1)
  }

  const [year = 0, monthNum = 1, day = 1] = range.endDate.split('-').map(Number)
  const endsOnLastDay = day === new Date(year, monthNum, 0).getDate()
  const isCurrentMonth = endMonth === toLocalDateString(today).substring(0, 7)
  if (startMonth < endMonth && !endsOnLastDay && !isCurrentMonth) {
    endMonth = shiftMonth(endMonth, -1)
  }

  return { startMonth, endMonth }
}
