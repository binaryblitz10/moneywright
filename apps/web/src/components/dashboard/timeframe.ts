/**
 * The dashboard-wide timeframe: its dates and the saved preference
 */

import { getPresetRange, isDatePresetId, type DatePresetId } from '@/lib/date-presets'
import { toLocalDateString } from './utils'
import type { ChartTimeframeKey, DashboardTimeframeSelection, DateRange } from './types'

// Timeframes saved before the date range picker: those with a matching preset become it, the
// rest turn into the dates they covered when picked
const LEGACY_PRESETS: Record<string, DatePresetId> = {
  this_month: 'month_to_date',
  '1y': 'last_12m',
}
const LEGACY_MONTHS: Record<string, number> = { '3m': 3, '6m': 6, '2y': 24, '3y': 36, '5y': 60 }

/** The dates a timeframe covers; null for dates picked by hand. All time reaches back ten years */
export function getTimeframeDateRange(
  key: ChartTimeframeKey,
  country: string | null | undefined
): DateRange | null {
  if (key === 'custom') return null
  if (key === 'all') return getMonthsBack(120)
  const { startDate, endDate } = getPresetRange(key, country)
  return { startDate: startDate!, endDate: endDate! }
}

/** From the first day of the month `months - 1` months ago to today */
function getMonthsBack(months: number): DateRange {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
  return { startDate: toLocalDateString(start), endDate: toLocalDateString(now) }
}

/**
 * Parse a saved dashboard timeframe preference
 * Returns null when the value is missing or no longer valid
 */
export function parseSavedTimeframe(value: string | undefined): DashboardTimeframeSelection | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<DashboardTimeframeSelection>
    const timeframe: unknown = parsed.timeframe
    if (typeof timeframe !== 'string') return null
    if (timeframe === 'custom') {
      const range = parsed.customDateRange
      if (!range?.startDate || !range.endDate) return null
      return { timeframe, customDateRange: range }
    }
    if (isDatePresetId(timeframe)) return { timeframe, customDateRange: null }

    const preset = LEGACY_PRESETS[timeframe]
    if (preset) return { timeframe: preset, customDateRange: null }
    const months = LEGACY_MONTHS[timeframe]
    if (months) return { timeframe: 'custom', customDateRange: getMonthsBack(months) }
    return null
  } catch {
    return null
  }
}
