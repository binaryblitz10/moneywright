import { useState } from 'react'
import { Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RangeCalendar } from '@/components/ui/range-calendar'
import { PICKER_COLORS_CLASS, PICKER_CONTENT_COLORS_CLASS } from '@/components/ui/picker-styles'
import { formatLongDate, parseLocalDate, parseTypedDate } from '@/lib/date-presets'
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

  // What is being typed; null while the field just shows the current value
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? display(value)

  /** Commits what was typed if it is a valid, allowed date; otherwise restores the current value */
  const commit = () => {
    const raw = text.trim()
    setDraft(null)
    if (!raw && clearable) return onChange('')
    const parsed = parseTypedDate(raw)
    if (parsed && (!minDate || parsed >= minDate) && (!maxDate || parsed <= maxDate)) {
      onChange(parsed)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            'flex h-10 w-full items-center rounded-lg border text-sm transition-colors focus-within:ring-2 focus-within:ring-ring',
            PICKER_COLORS_CLASS,
            disabled && 'pointer-events-none opacity-50',
            className
          )}
        >
          <input
            id={id}
            type="text"
            value={text}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commit()
              }
            }}
            className="h-full min-w-0 flex-1 bg-transparent pl-3 outline-none placeholder:text-muted-foreground"
          />
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label="Open calendar"
              className="flex h-full shrink-0 cursor-pointer items-center px-3"
            >
              <Calendar className="h-4 w-4 opacity-50" />
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
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

function display(value: string): string {
  return value ? formatLongDate(value) : ''
}
