/**
 * Dashboard types and constants
 */

import type { DatePresetId } from '@/lib/date-presets'

// Timeframe options for stats
export type TimeframeKey =
  | 'this_month'
  | 'this_year'
  | 'last_7d'
  | 'last_30d'
  | 'last_3m'
  | 'last_6m'
  | 'last_1y'
  | 'last_3y'
  | 'all_time'

export const TIMEFRAME_OPTIONS: { key: TimeframeKey; label: string; shortLabel: string }[] = [
  { key: 'this_month', label: 'This Month', shortLabel: 'This Month' },
  { key: 'this_year', label: 'This Year', shortLabel: 'This Year' },
  { key: 'last_7d', label: 'Last 7 Days', shortLabel: 'Last 7d' },
  { key: 'last_30d', label: 'Last 30 Days', shortLabel: 'Last 30d' },
  { key: 'last_3m', label: 'Last 3 Months', shortLabel: 'Last 3m' },
  { key: 'last_6m', label: 'Last 6 Months', shortLabel: 'Last 6m' },
  { key: 'last_1y', label: 'Last 1 Year', shortLabel: 'Last 1y' },
  { key: 'last_3y', label: 'Last 3 Years', shortLabel: 'Last 3y' },
  { key: 'all_time', label: 'All Time', shortLabel: 'All Time' },
]

/** A named date range from the date range picker, or dates picked by hand */
export type ChartTimeframeKey = DatePresetId | 'custom'

export interface DateRange {
  startDate: string
  endDate: string
}

/** The dashboard-wide timeframe selection, saved as a user preference */
export interface DashboardTimeframeSelection {
  timeframe: ChartTimeframeKey
  customDateRange: DateRange | null
}

export const DEFAULT_TIMEFRAME_SELECTION: DashboardTimeframeSelection = {
  timeframe: 'last_12m',
  customDateRange: null,
}

// Sort options for month transactions
export type SortOption = 'latest' | 'oldest' | 'highest' | 'lowest'
export type ViewMode = 'transactions' | 'categories'

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'highest', label: 'Highest' },
  { value: 'lowest', label: 'Lowest' },
  { value: 'latest', label: 'Latest' },
  { value: 'oldest', label: 'Oldest' },
]
