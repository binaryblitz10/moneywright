/**
 * Month range picker for the reports: the dashboard's time frames or a custom start and end
 * month. The current month shows the data so far.
 */

import { useMemo } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { ReportBounds } from '@/lib/api'
import { getFinancialYearRange } from '@/components/dashboard/utils'
import {
  FY_PRESETS,
  PERIOD_PRESETS,
  formatMonth,
  formatRange,
  matchPreset,
  monthsBetween,
  presetRange,
  type MonthRange,
} from './report-utils'

interface PeriodPickerProps {
  range: MonthRange
  bounds: ReportBounds
  userCountry: string | null | undefined
  onChange: (range: MonthRange) => void
}

function optionClass(active: boolean): string {
  return cn(
    'px-3 py-2 text-sm font-medium rounded-lg transition-colors text-left',
    active
      ? 'bg-primary text-primary-foreground'
      : 'bg-surface-elevated hover:bg-surface-hover text-foreground'
  )
}

export function PeriodPicker({ range, bounds, userCountry, onChange }: PeriodPickerProps) {
  const preset = matchPreset(range, bounds, userCountry)
  // Newest first, so the recent months are at the top of the list
  const months = useMemo(
    () =>
      bounds.earliestMonth
        ? monthsBetween(bounds.earliestMonth, bounds.currentMonth).reverse()
        : [],
    [bounds]
  )

  // Presets that have months with data to show: periods, then financial years, then all time
  const options = [
    ...PERIOD_PRESETS.filter((p) => p.key !== 'all'),
    ...FY_PRESETS.map(({ key, offset }) => ({
      key,
      label: getFinancialYearRange(userCountry, offset).label,
    })),
    ...PERIOD_PRESETS.filter((p) => p.key === 'all'),
  ].flatMap(({ key, label }) => {
    const optionRange = presetRange(key, bounds, userCountry)
    return optionRange ? [{ key, label, range: optionRange }] : []
  })

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 text-sm">
          <Calendar className="mr-1.5 h-4 w-4" />
          {formatRange(range)}
          <ChevronDown className="ml-1 h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-3">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-1.5">
            {options.map(({ key, label, range: optionRange }) => (
              <button
                key={key}
                onClick={() => onChange(optionRange)}
                className={optionClass(preset === key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="h-px bg-border-subtle" />

          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Custom{preset === null && ' (selected)'}
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">From</Label>
                <Select
                  value={range.from}
                  onValueChange={(from) =>
                    onChange({ from, to: from > range.to ? from : range.to })
                  }
                >
                  <SelectTrigger className="h-8 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="min-w-44">
                    {months.map((m) => (
                      <SelectItem key={m} value={m}>
                        {formatMonth(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">To</Label>
                <Select
                  value={range.to}
                  onValueChange={(to) => onChange({ from: to < range.from ? to : range.from, to })}
                >
                  <SelectTrigger className="h-8 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="min-w-44">
                    {months.map((m) => (
                      <SelectItem key={m} value={m}>
                        {formatMonth(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
