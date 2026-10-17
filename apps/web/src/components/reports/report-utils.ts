/**
 * Helpers for the Reports section: month ranges, labels and the period presets
 */

import type { ReportBounds } from '@/lib/api'

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export type ReportTab = 'period' | 'trends' | 'investments'

export interface MonthRange {
  /** YYYY-MM */
  from: string
  /** YYYY-MM */
  to: string
}

export type PresetKey = 'last_1' | 'last_3' | 'last_6' | 'last_12'

export const PERIOD_PRESETS: Array<{ key: PresetKey; label: string; months: number }> = [
  { key: 'last_1', label: 'Last month', months: 1 },
  { key: 'last_3', label: 'Last 3 months', months: 3 },
  { key: 'last_6', label: 'Last 6 months', months: 6 },
  { key: 'last_12', label: 'Last 12 months', months: 12 },
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

/** The range a preset covers, ending at the last complete month and not before the first month with data */
export function presetRange(key: PresetKey, bounds: ReportBounds): MonthRange {
  const months = PERIOD_PRESETS.find((p) => p.key === key)?.months ?? 1
  const from = shiftMonth(bounds.lastCompleteMonth, -(months - 1))
  const earliest = bounds.earliestMonth
  return {
    from: earliest && from < earliest ? earliest : from,
    to: bounds.lastCompleteMonth,
  }
}

/** Which preset a range is, if any */
export function matchPreset(range: MonthRange, bounds: ReportBounds): PresetKey | null {
  return (
    PERIOD_PRESETS.find((p) => {
      const preset = presetRange(p.key, bounds)
      return preset.from === range.from && preset.to === range.to
    })?.key ?? null
  )
}

/**
 * The range to report on: the URL's months when they are valid, else last month.
 * Null when there are no complete months with data yet.
 */
export function resolveRange(
  from: string | undefined,
  to: string | undefined,
  bounds: ReportBounds
): MonthRange | null {
  const { earliestMonth, lastCompleteMonth } = bounds
  if (!earliestMonth || earliestMonth > lastCompleteMonth) return null
  if (from && to && from <= to && from >= earliestMonth && to <= lastCompleteMonth) {
    return { from, to }
  }
  return { from: lastCompleteMonth, to: lastCompleteMonth }
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
