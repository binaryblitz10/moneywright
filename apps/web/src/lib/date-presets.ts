/**
 * Named date ranges for the date range pickers ("Last 7 days", "Month to date", ...)
 * Dates are local YYYY-MM-DD strings; weeks run Sunday to Saturday and quarters are calendar quarters.
 */

import { getFinancialYearRange, toLocalDateString } from '@/components/dashboard/utils'

export type DatePresetId =
  | 'today'
  | 'yesterday'
  | 'all'
  | 'last_7d'
  | 'last_30d'
  | 'last_week'
  | 'last_month'
  | 'last_quarter'
  | 'last_12m'
  | 'last_year'
  | 'current_fy'
  | 'last_fy'
  | 'week_to_date'
  | 'month_to_date'
  | 'quarter_to_date'
  | 'year_to_date'

/** A date range; both are empty for all time */
export interface DateRangeValue {
  startDate?: string
  endDate?: string
}

export interface DatePreset {
  id: DatePresetId
  label: string
}

/** Presets listed directly in the picker */
export const QUICK_PRESETS: DatePreset[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'all', label: 'All time' },
]

/** The "Last" submenu, before the financial years */
export const LAST_PRESETS: DatePreset[] = [
  { id: 'last_7d', label: 'Last 7 days' },
  { id: 'last_30d', label: 'Last 30 days' },
  { id: 'last_week', label: 'Last week' },
  { id: 'last_month', label: 'Last month' },
  { id: 'last_quarter', label: 'Last quarter' },
  { id: 'last_12m', label: 'Last 12 months' },
  { id: 'last_year', label: 'Last year' },
]

/** The current and previous financial year, labelled by country */
export const FINANCIAL_YEAR_PRESETS: Array<{ id: DatePresetId; offset: number }> = [
  { id: 'current_fy', offset: 0 },
  { id: 'last_fy', offset: -1 },
]

/** The "Period to date" submenu */
export const PERIOD_TO_DATE_PRESETS: DatePreset[] = [
  { id: 'week_to_date', label: 'Week to date' },
  { id: 'month_to_date', label: 'Month to date' },
  { id: 'quarter_to_date', label: 'Quarter to date' },
  { id: 'year_to_date', label: 'Year to date' },
]

const ALL_PRESET_IDS: DatePresetId[] = [
  ...QUICK_PRESETS.map((p) => p.id),
  ...LAST_PRESETS.map((p) => p.id),
  ...FINANCIAL_YEAR_PRESETS.map((p) => p.id),
  ...PERIOD_TO_DATE_PRESETS.map((p) => p.id),
]

export function isDatePresetId(value: unknown): value is DatePresetId {
  return ALL_PRESET_IDS.includes(value as DatePresetId)
}

export function getPresetLabel(id: DatePresetId, country: string | null | undefined): string {
  const fy = FINANCIAL_YEAR_PRESETS.find((p) => p.id === id)
  if (fy) return getFinancialYearRange(country, fy.offset).label
  return [...QUICK_PRESETS, ...LAST_PRESETS, ...PERIOD_TO_DATE_PRESETS].find((p) => p.id === id)!
    .label
}

/** The dates a preset covers today; empty for all time */
export function getPresetRange(
  id: DatePresetId,
  country: string | null | undefined,
  now: Date = new Date()
): DateRangeValue {
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  const today = new Date(y, m, d)
  const quarterStartMonth = Math.floor(m / 3) * 3
  const weekStartDay = d - now.getDay()
  const range = (start: Date, end: Date): DateRangeValue => ({
    startDate: toLocalDateString(start),
    endDate: toLocalDateString(end),
  })

  switch (id) {
    case 'today':
      return range(today, today)
    case 'yesterday':
      return range(new Date(y, m, d - 1), new Date(y, m, d - 1))
    case 'all':
      return {}
    case 'last_7d':
      return range(new Date(y, m, d - 6), today)
    case 'last_30d':
      return range(new Date(y, m, d - 29), today)
    case 'last_week':
      return range(new Date(y, m, weekStartDay - 7), new Date(y, m, weekStartDay - 1))
    case 'last_month':
      return range(new Date(y, m - 1, 1), new Date(y, m, 0))
    case 'last_quarter':
      return range(new Date(y, quarterStartMonth - 3, 1), new Date(y, quarterStartMonth, 0))
    case 'last_12m':
      return range(new Date(y, m - 12, d + 1), today)
    case 'last_year':
      return range(new Date(y - 1, 0, 1), new Date(y - 1, 11, 31))
    case 'current_fy':
    case 'last_fy': {
      const fy = getFinancialYearRange(country, id === 'current_fy' ? 0 : -1)
      return { startDate: fy.startDate, endDate: fy.endDate }
    }
    case 'week_to_date':
      return range(new Date(y, m, weekStartDay), today)
    case 'month_to_date':
      return range(new Date(y, m, 1), today)
    case 'quarter_to_date':
      return range(new Date(y, quarterStartMonth, 1), today)
    case 'year_to_date':
      return range(new Date(y, 0, 1), today)
  }
}

/** The first preset that covers exactly these dates, if any */
export function findPresetId(
  range: DateRangeValue,
  country: string | null | undefined
): DatePresetId | null {
  return (
    ALL_PRESET_IDS.find((id) => {
      const preset = getPresetRange(id, country)
      return preset.startDate === range.startDate && preset.endDate === range.endDate
    }) ?? null
  )
}

/** Parse a YYYY-MM-DD string as a local date */
export function parseLocalDate(value: string): Date {
  const [y = 0, m = 1, d = 1] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** e.g. "27 Oct 2026" */
export function formatShortDate(value: string): string {
  return parseLocalDate(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** e.g. "27 October 2026" */
export function formatLongDate(value: string): string {
  return parseLocalDate(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** The preset's name when the range is one, else the dates, e.g. "1 Oct 2026 - 27 Oct 2026" */
export function getRangeLabel(
  range: DateRangeValue,
  country: string | null | undefined,
  presetId?: DatePresetId | null
): string {
  const id = presetId === undefined ? findPresetId(range, country) : presetId
  if (id) return getPresetLabel(id, country)

  const { startDate, endDate } = range
  if (startDate && endDate) {
    return startDate === endDate
      ? formatShortDate(startDate)
      : `${formatShortDate(startDate)} - ${formatShortDate(endDate)}`
  }
  if (startDate) return `From ${formatShortDate(startDate)}`
  if (endDate) return `Until ${formatShortDate(endDate)}`
  return getPresetLabel('all', country)
}
