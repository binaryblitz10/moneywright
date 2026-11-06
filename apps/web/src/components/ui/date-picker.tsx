import { useState } from 'react'
import { Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RangeCalendar } from '@/components/ui/range-calendar'
import { PICKER_COLORS_CLASS, PICKER_CONTENT_COLORS_CLASS } from '@/components/ui/picker-styles'
import { formatLongDate, parseLocalDate } from '@/lib/date-presets'
import { cn } from '@/lib/utils'

export interface DatePickerProps {
  id?: string
  /** A local YYYY-MM-DD date, or empty for none */
  value: string
  onChange: (value: string) => void
  /** Days outside these dates cannot be picked */
  minDate?: string
  maxDate?: string
  placeholder?: string
  /** Adds a Clear button, for dates that are optional */
  clearable?: boolean
  disabled?: boolean
  className?: string
}

/** One date in a form: the same calendar as the date range picker, in a popover */
export function DatePicker({
  id,
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = 'Select a date',
  clearable = false,
  disabled,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => viewFor(value))

  const handleOpenChange = (next: boolean) => {
    if (next) setMonth(viewFor(value))
    setOpen(next)
  }

  const pick = (date: string) => {
    onChange(date)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'h-10 w-full justify-between rounded-lg font-normal',
            PICKER_COLORS_CLASS,
            !value && 'text-muted-foreground',
            className
          )}
        >
          <span className="truncate">{value ? formatLongDate(value) : placeholder}</span>
          <Calendar className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={16}
        className={cn(
          PICKER_CONTENT_COLORS_CLASS,
          'w-auto overflow-hidden rounded-2xl p-4 select-none'
        )}
      >
        <RangeCalendar
          months={1}
          month={month}
          onMonthChange={setMonth}
          startDate={value || undefined}
          endDate={value || undefined}
          onPreviewChange={() => {}}
          onSelect={pick}
          minDate={minDate}
          maxDate={maxDate}
        />
        {clearable && value && (
          <div className="mt-3 flex justify-end border-t border-border-subtle pt-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => pick('')}>
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** The month the calendar opens on: the date's, or this month */
function viewFor(value: string): Date {
  const anchor = value ? parseLocalDate(value) : new Date()
  return new Date(anchor.getFullYear(), anchor.getMonth(), 1)
}
