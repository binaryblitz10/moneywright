import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CHART_TIMEFRAME_OPTIONS, type ChartTimeframeKey } from '@/components/dashboard/types'
import { getFinancialYearRange, getTimeframeDateRange } from '@/components/dashboard/utils'

// Same presets as the dashboard timeframe picker. 'all' means no date filter here.
const TIME_PRESETS = CHART_TIMEFRAME_OPTIONS.filter((o) => o.key !== 'custom' && !o.isFiscal)

type FiscalKey = 'current_fy' | 'last_fy'
const FISCAL_KEYS: FiscalKey[] = ['current_fy', 'last_fy']

/**
 * Get the date range for a preset (empty for All time, which has no date filter)
 */
function getPresetRange(
  key: ChartTimeframeKey,
  country: string | null | undefined
): { startDate?: string; endDate?: string } {
  if (key === 'all') return {}
  return getTimeframeDateRange(key, country) ?? {}
}

function rangeMatches(
  key: ChartTimeframeKey,
  country: string | null | undefined,
  startDate?: string,
  endDate?: string
): boolean {
  const range = getPresetRange(key, country)
  return range.startDate === startDate && range.endDate === endDate
}

/**
 * Get display label for a date range
 */
export function getDateRangeLabel(
  startDate?: string,
  endDate?: string,
  country?: string | null
): string {
  if (!startDate && !endDate) return 'All time'

  for (const preset of TIME_PRESETS) {
    if (rangeMatches(preset.key, country, startDate, endDate)) return preset.label
  }
  for (const key of FISCAL_KEYS) {
    if (rangeMatches(key, country, startDate, endDate)) {
      return getFinancialYearRange(country, key === 'current_fy' ? 0 : -1).label
    }
  }

  // Custom range - format nicely
  if (startDate && endDate) {
    return `${formatDate(startDate)} - ${formatDate(endDate)}`
  } else if (startDate) {
    return `From ${formatDate(startDate)}`
  } else if (endDate) {
    return `Until ${formatDate(endDate)}`
  }

  return 'All time'
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}

interface DateRangePickerProps {
  startDate?: string
  endDate?: string
  onDateChange: (startDate?: string, endDate?: string) => void
  country?: string | null
  className?: string
  /** Show FY options (requires country) */
  showFiscalYear?: boolean
  /** Align popover */
  align?: 'start' | 'center' | 'end'
  /** Button variant - 'ghost' for dashboard style, 'outline' for filter bar style */
  variant?: 'ghost' | 'outline'
}

export function DateRangePicker({
  startDate,
  endDate,
  onDateChange,
  country,
  className,
  showFiscalYear = true,
  align = 'start',
  variant = 'ghost',
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [customRange, setCustomRange] = useState<{ startDate?: string; endDate?: string } | null>(
    null
  )

  const displayLabel = getDateRangeLabel(startDate, endDate, country)
  const hasDateFilter = startDate || endDate

  // Check if current selection is a custom range (not matching any preset)
  const isCustomSelection =
    !!(startDate || endDate) &&
    ![...TIME_PRESETS.map((p) => p.key), ...FISCAL_KEYS].some((key) =>
      rangeMatches(key, country, startDate, endDate)
    )

  // Initialize custom range from current selection if it's custom
  const effectiveCustomRange =
    isCustomSelection && startDate && endDate ? { startDate, endDate } : customRange

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={variant}
          size={variant === 'outline' ? 'default' : 'sm'}
          className={cn(
            variant === 'ghost'
              ? cn(
                  'h-7 text-xs text-muted-foreground hover:text-foreground',
                  hasDateFilter && 'text-foreground'
                )
              : cn(
                  'justify-between h-10 rounded-lg font-normal',
                  'bg-surface-elevated border-border-subtle',
                  'hover:bg-surface-hover hover:border-border-hover',
                  hasDateFilter && 'border-primary/30 bg-primary/5'
                ),
            className
          )}
        >
          {variant === 'ghost' && <Calendar className="mr-1.5 h-3 w-3" />}
          <span className={variant === 'outline' ? 'truncate' : undefined}>{displayLabel}</span>
          <ChevronDown
            className={variant === 'ghost' ? 'ml-1 h-3 w-3' : 'h-4 w-4 shrink-0 opacity-50 ml-2'}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align={align}>
        <div className="space-y-3">
          {/* Standard time presets */}
          <div className="grid grid-cols-2 gap-1.5">
            {TIME_PRESETS.map((preset) => {
              const range = getPresetRange(preset.key, country)
              const isSelected =
                startDate === range.startDate && endDate === range.endDate && !isCustomSelection

              return (
                <button
                  key={preset.key}
                  onClick={() => {
                    onDateChange(range.startDate, range.endDate)
                    setCustomRange(null)
                    setOpen(false)
                  }}
                  className={cn(
                    'px-3 py-2 text-sm font-medium rounded-lg transition-colors text-left',
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface-elevated hover:bg-surface-hover text-foreground'
                  )}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>

          {/* Financial Year section */}
          {showFiscalYear && (
            <>
              <div className="h-px bg-border-subtle" />
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Financial Year
                </Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {FISCAL_KEYS.map((key) => {
                    const fy = getFinancialYearRange(country, key === 'current_fy' ? 0 : -1)
                    const isSelected =
                      startDate === fy.startDate && endDate === fy.endDate && !isCustomSelection

                    return (
                      <button
                        key={key}
                        onClick={() => {
                          onDateChange(fy.startDate, fy.endDate)
                          setCustomRange(null)
                          setOpen(false)
                        }}
                        className={cn(
                          'px-3 py-2 text-sm font-medium rounded-lg transition-colors text-left',
                          isSelected
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-surface-elevated hover:bg-surface-hover text-foreground'
                        )}
                      >
                        {fy.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {/* Custom Range section */}
          <div className="h-px bg-border-subtle" />
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Custom Range
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input
                  type="date"
                  value={effectiveCustomRange?.startDate || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      const newRange = {
                        startDate: e.target.value,
                        endDate:
                          effectiveCustomRange?.endDate || new Date().toISOString().split('T')[0]!,
                      }
                      setCustomRange(newRange)
                      onDateChange(newRange.startDate, newRange.endDate)
                    }
                  }}
                  className="h-8 rounded-lg text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input
                  type="date"
                  value={effectiveCustomRange?.endDate || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      const newRange = {
                        startDate: effectiveCustomRange?.startDate || '2020-01-01',
                        endDate: e.target.value,
                      }
                      setCustomRange(newRange)
                      onDateChange(newRange.startDate, newRange.endDate)
                    }
                  }}
                  className="h-8 rounded-lg text-sm"
                />
              </div>
            </div>
            {effectiveCustomRange && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground h-7 text-xs"
                onClick={() => {
                  setCustomRange(null)
                  onDateChange(undefined, undefined)
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
