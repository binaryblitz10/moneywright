/**
 * Helpers for the Reports section: month ranges, labels and the period presets
 */

import type { ReportBounds } from '@/lib/api'
import { getFinancialYearRange } from '@/components/dashboard/utils'

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export type ReportTab = 'period' | 'trends' | 'investments'

export interface MonthRange {
  /** YYYY-MM */
  from: string
  /** YYYY-MM */
  to: string
}

export type PresetKey =
  | 'this_month'
  | 'last_1'
  | 'last_3'
  | 'last_6'
  | 'last_12'
  | 'last_24'
  | 'last_36'
  | 'last_60'
  | 'all'
  | 'current_fy'
  | 'last_fy'

/** The dashboard's time frames; "This month" shows the data so far, the rest end at the last complete month */
export const PERIOD_PRESETS: Array<{ key: PresetKey; label: string; months?: number }> = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_1', label: 'Last month', months: 1 },
  { key: 'last_3', label: 'Last 3 months', months: 3 },
  { key: 'last_6', label: 'Last 6 months', months: 6 },
  { key: 'last_12', label: 'Last 1 year', months: 12 },
  { key: 'last_24', label: 'Last 2 years', months: 24 },
  { key: 'last_36', label: 'Last 3 years', months: 36 },
  { key: 'last_60', label: 'Last 5 years', months: 60 },
  { key: 'all', label: 'All time' },
]

/** Financial year presets, labelled with the user's country-specific year */
export const FY_PRESETS: Array<{ key: PresetKey; offset: number }> = [
  { key: 'current_fy', offset: 0 },
  { key: 'last_fy', offset: -1 },
]

/** Month (YYYY-MM) shifted by a number of months */
export function shiftMonth(month: string, delta: number): string {
  const [year = 0, mon = 1] = month.split('-').map(Number)
  const index = year * 12 + (mon - 1) + delta
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/** Every month from `from` to `to`, inclusive */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = []
  for (let month = from; month <= to; month = shiftMonth(month, 1)) months.push(month)
  return months
}

/** e.g. "September 2026" */
export function formatMonth(month: string): string {
  const [year = 0, mon = 1] = month.split('-').map(Number)
  return new Date(year, mon - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/** e.g. "September" */
export function formatMonthName(month: string): string {
  const [year = 0, mon = 1] = month.split('-').map(Number)
  return new Date(year, mon - 1, 1).toLocaleDateString('en-US', { month: 'long' })
}

/** "September 2026", "July – September 2026" or "November 2025 – January 2026" */
export function formatRange(range: MonthRange): string {
  if (range.from === range.to) return formatMonth(range.from)
  const sameYear = range.from.substring(0, 4) === range.to.substring(0, 4)
  const start = sameYear ? formatMonthName(range.from) : formatMonth(range.from)
  return `${start} – ${formatMonth(range.to)}`
}

/** First and last day of a YYYY-MM month as YYYY-MM-DD */
export function monthDates(month: string): { startDate: string; endDate: string } {
  const [year = 0, mon = 1] = month.split('-').map(Number)
  const lastDay = new Date(year, mon, 0).getDate()
  return { startDate: `${month}-01`, endDate: `${month}-${String(lastDay).padStart(2, '0')}` }
}

/**
 * The range a preset covers, ending at the current month (the last complete month for "last
 * month") and not before the first month with data. Null when the preset falls outside the months that can be reported.
 */
export function presetRange(
  key: PresetKey,
  bounds: ReportBounds,
  country: string | null | undefined
): MonthRange | null {
  const { earliestMonth, lastCompleteMonth, currentMonth } = bounds
  if (!earliestMonth) return null
  if (key === 'this_month')
    return earliestMonth <= currentMonth ? { from: currentMonth, to: currentMonth } : null

  // Everything but "last month" runs through the current month, so the month in progress counts
  let from: string
  let to = currentMonth
  const fy = FY_PRESETS.find((p) => p.key === key)
  if (fy) {
    const year = getFinancialYearRange(country, fy.offset)
    from = year.startDate.substring(0, 7)
    to = year.endDate.substring(0, 7) < to ? year.endDate.substring(0, 7) : to
  } else if (key === 'all') {
    from = earliestMonth
  } else if (key === 'last_1') {
    from = to = lastCompleteMonth
  } else {
    const months = PERIOD_PRESETS.find((p) => p.key === key)?.months ?? 1
    from = shiftMonth(currentMonth, -(months - 1))
  }

  if (from < earliestMonth) from = earliestMonth
  return from <= to ? { from, to } : null
}

/** Every preset a range is: several can cover the same months, e.g. a financial year and the last 6 months */
export function matchPresets(
  range: MonthRange,
  bounds: ReportBounds,
  country: string | null | undefined
): PresetKey[] {
  return [...PERIOD_PRESETS, ...FY_PRESETS]
    .filter((p) => {
      const preset = presetRange(p.key, bounds, country)
      return preset?.from === range.from && preset.to === range.to
    })
    .map((p) => p.key)
}

/**
 * The range to report on: the URL's months when they are valid, else last month.
 * Null when there are no months with data yet.
 */
export function resolveRange(
  from: string | undefined,
  to: string | undefined,
  bounds: ReportBounds
): MonthRange | null {
  const { earliestMonth, lastCompleteMonth, currentMonth } = bounds
  if (!earliestMonth || earliestMonth > currentMonth) return null
  if (from && to && from <= to && from >= earliestMonth && to <= currentMonth) {
    return { from, to }
  }
  // Default to the last finished month, or the month in progress when that is all there is
  const month = earliestMonth > lastCompleteMonth ? currentMonth : lastCompleteMonth
  return { from: month, to: month }
}

/** "+12%" / "-8%" for a fraction */
export function formatPct(fraction: number): string {
  const pct = Math.round(fraction * 100)
  return `${pct > 0 ? '+' : ''}${pct}%`
}

/** The same number of months just before the range, or null when that would start before the data does */
export function comparisonRange(range: MonthRange, bounds: ReportBounds): MonthRange | null {
  const count = monthsBetween(range.from, range.to).length
  const from = shiftMonth(range.from, -count)
  if (!bounds.earliestMonth || from < bounds.earliestMonth) return null
  return { from, to: shiftMonth(range.from, -1) }
}
