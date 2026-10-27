/**
 * Dashboard-wide timeframe picker
 * One selection drives every date-based widget on the dashboard
 */

import { DateRangePicker } from '@/components/ui/date-range-picker'
import { getPresetRange } from '@/lib/date-presets'
import type { DashboardTimeframeSelection } from './types'

interface DashboardTimeframePickerProps {
  selection: DashboardTimeframeSelection
  onChange: (selection: DashboardTimeframeSelection) => void
  userCountry: string | null | undefined
}

export function DashboardTimeframePicker({
  selection,
  onChange,
  userCountry,
}: DashboardTimeframePickerProps) {
  const { timeframe, customDateRange } = selection
  const range = timeframe === 'custom' ? customDateRange : getPresetRange(timeframe, userCountry)

  return (
    <DateRangePicker
      startDate={range?.startDate}
      endDate={range?.endDate}
      presetId={timeframe === 'custom' ? null : timeframe}
      country={userCountry}
      align="end"
      onChange={(startDate, endDate, presetId) =>
        onChange(
          presetId
            ? { timeframe: presetId, customDateRange: null }
            : { timeframe: 'custom', customDateRange: { startDate: startDate!, endDate: endDate! } }
        )
      }
    />
  )
}
