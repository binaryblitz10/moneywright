/**
 * Dashboard-wide timeframe picker
 * One selection drives every date-based widget on the dashboard
 */

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getFinancialYearRange } from './utils'
import { CHART_TIMEFRAME_OPTIONS, type ChartTimeframeKey, type DateRange } from './types'

interface DashboardTimeframePickerProps {
  timeframe: ChartTimeframeKey
  onTimeframeChange: (timeframe: ChartTimeframeKey) => void
  customDateRange: DateRange | null
  onCustomDateRangeChange: (range: DateRange | null) => void
  userCountry: string | null | undefined
}

const OPTION_CLASS = 'px-3 py-2 text-sm font-medium rounded-lg transition-colors text-left'

function optionClass(active: boolean): string {
  return cn(
    OPTION_CLASS,
    active
      ? 'bg-primary text-primary-foreground'
      : 'bg-surface-elevated hover:bg-surface-hover text-foreground'
  )
}

export function DashboardTimeframePicker({
  timeframe,
  onTimeframeChange,
  customDateRange,
  onCustomDateRangeChange,
  userCountry,
}: DashboardTimeframePickerProps) {
  const label = useMemo(() => {
    if (timeframe === 'custom' && customDateRange) {
      const format = (date: string) =>
        new Date(date).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: '2-digit',
        })
      return `${format(customDateRange.startDate)} - ${format(customDateRange.endDate)}`
    }
    if (timeframe === 'current_fy') return getFinancialYearRange(userCountry, 0).label
    if (timeframe === 'last_fy') return getFinancialYearRange(userCountry, -1).label
    return CHART_TIMEFRAME_OPTIONS.find((t) => t.key === timeframe)?.label || 'Last 1 year'
  }, [timeframe, customDateRange, userCountry])

  const selectPreset = (key: ChartTimeframeKey) => {
    onTimeframeChange(key)
    onCustomDateRangeChange(null)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 text-sm">
          <Calendar className="mr-1.5 h-4 w-4" />
          {label}
          <ChevronDown className="ml-1 h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="space-y-3">
          {/* Standard time ranges */}
          <div className="grid grid-cols-2 gap-1.5">
            {CHART_TIMEFRAME_OPTIONS.filter((o) => o.months).map((option) => (
              <button
                key={option.key}
                onClick={() => selectPreset(option.key)}
                className={optionClass(timeframe === option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="h-px bg-border-subtle" />

          {/* Financial year options */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Financial Year
            </Label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => selectPreset('current_fy')}
                className={optionClass(timeframe === 'current_fy')}
              >
                {getFinancialYearRange(userCountry, 0).label}
              </button>
              <button
                onClick={() => selectPreset('last_fy')}
                className={optionClass(timeframe === 'last_fy')}
              >
                {getFinancialYearRange(userCountry, -1).label}
              </button>
            </div>
          </div>

          <div className="h-px bg-border-subtle" />

          {/* Custom date range */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Custom Range
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input
                  type="date"
                  value={customDateRange?.startDate || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      onCustomDateRangeChange({
                        startDate: e.target.value,
                        endDate:
                          customDateRange?.endDate || new Date().toISOString().split('T')[0]!,
                      })
                      onTimeframeChange('custom')
                    }
                  }}
                  className="h-8 rounded-lg text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input
                  type="date"
                  value={customDateRange?.endDate || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      onCustomDateRangeChange({
                        startDate: customDateRange?.startDate || '2020-01-01',
                        endDate: e.target.value,
                      })
                      onTimeframeChange('custom')
                    }
                  }}
                  className="h-8 rounded-lg text-sm"
                />
              </div>
            </div>
            {customDateRange && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground h-7 text-xs"
                onClick={() => {
                  onCustomDateRangeChange(null)
                  onTimeframeChange('1y')
                }}
              >
                <X className="mr-1.5 h-3 w-3" />
                Clear custom range
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
