/**
 * Month range picker for the reports: presets that end at the last complete month,
 * or a custom start and end month. Only complete months with data can be picked.
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
import {
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

export function PeriodPicker({ range, bounds, onChange }: PeriodPickerProps) {
  const preset = matchPreset(range, bounds)
  // Newest first, so the recent months are at the top of the list
  const months = useMemo(
    () =>
      bounds.earliestMonth
        ? monthsBetween(bounds.earliestMonth, bounds.lastCompleteMonth).reverse()
        : [],
    [bounds]
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 text-sm">
          <Calendar className="mr-1.5 h-4 w-4" />
          {formatRange(range)}
          <ChevronDown className="ml-1 h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-1.5">
            {PERIOD_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => onChange(presetRange(p.key, bounds))}
                className={optionClass(preset === p.key)}
              >
                {p.label}
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
                  <SelectContent>
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
                  <SelectContent>
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
