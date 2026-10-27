/**
 * Month range picker for the reports: pick dates and the months they touch are reported.
 * The current month shows the data so far.
 */

import { DateRangePicker } from '@/components/ui/date-range-picker'
import type { ReportBounds } from '@/lib/api'
import { formatRange, monthDates, type MonthRange } from './report-utils'

interface PeriodPickerProps {
  range: MonthRange
  bounds: ReportBounds
  userCountry: string | null | undefined
  onChange: (range: MonthRange) => void
}

/** The months with data that a date range touches */
function toMonthRange(
  startDate: string | undefined,
  endDate: string | undefined,
  { earliestMonth, currentMonth }: ReportBounds
): MonthRange {
  if (!earliestMonth || !startDate || !endDate) {
    return { from: earliestMonth ?? currentMonth, to: currentMonth }
  }
  const to = endDate.substring(0, 7) < earliestMonth ? earliestMonth : endDate.substring(0, 7)
  const from = startDate.substring(0, 7)
  return {
    from: from < earliestMonth ? earliestMonth : from > currentMonth ? currentMonth : from,
    to: to > currentMonth ? currentMonth : to,
  }
}

export function PeriodPicker({ range, bounds, userCountry, onChange }: PeriodPickerProps) {
  return (
    <DateRangePicker
      startDate={monthDates(range.from).startDate}
      endDate={monthDates(range.to).endDate}
      presetId={null}
      label={formatRange(range)}
      country={userCountry}
      minDate={bounds.earliestMonth ? monthDates(bounds.earliestMonth).startDate : undefined}
      maxDate={monthDates(bounds.currentMonth).endDate}
      align="end"
      onChange={(startDate, endDate) => onChange(toMonthRange(startDate, endDate, bounds))}
    />
  )
}
