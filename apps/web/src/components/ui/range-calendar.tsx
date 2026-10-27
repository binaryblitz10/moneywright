import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toLocalDateString } from '@/components/dashboard/utils'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface RangeCalendarProps {
  /** First day of the first month shown; the next month is shown beside it */
  month: Date
  onMonthChange: (month: Date) => void
  startDate?: string
  endDate?: string
  /** While the end date is being picked, the day under the pointer previews the range */
  previewDate?: string
  onPreviewChange: (date?: string) => void
  onSelect: (date: string) => void
  /** Days outside these dates cannot be picked */
  minDate?: string
  maxDate?: string
}

interface MonthGridProps extends Omit<RangeCalendarProps, 'month' | 'onMonthChange'> {
  month: Date
  /** Which arrows this month carries */
  prev?: () => void
  next?: () => void
  /** Hides the next arrow where another month already carries it */
  nextClassName?: string
  className?: string
}

function MonthGrid({
  month,
  prev,
  next,
  nextClassName,
  className,
  startDate,
  endDate,
  previewDate,
  onPreviewChange,
  onSelect,
  minDate,
  maxDate,
}: MonthGridProps) {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const leading = new Date(year, monthIndex, 1).getDay()
  const today = toLocalDateString(new Date())

  // While picking the end, the range runs from the start to the day under the pointer
  const previewing = !!startDate && startDate === endDate && !!previewDate
  const [from, to] = previewing ? [startDate, previewDate].sort() : [startDate, endDate]

  return (
    <div className={cn('w-[17rem]', className)}>
      <div className="relative mb-3 flex h-8 items-center justify-center">
        {prev && (
          <button
            type="button"
            aria-label="Previous month"
            onClick={prev}
            className="absolute left-0 flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
        )}
        <span className="text-sm font-semibold">
          {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </span>
        {next && (
          <button
            type="button"
            aria-label="Next month"
            onClick={next}
            className={cn(
              'absolute right-0 flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground',
              nextClassName
            )}
          >
            <ChevronRight className="size-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="pb-1.5 text-xs text-muted-foreground">
            {weekday}
          </div>
        ))}
        {Array.from({ length: leading }, (_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const date = toLocalDateString(new Date(year, monthIndex, i + 1))
          const isStart = date === from
          const isEnd = date === to
          const inRange = !!from && !!to && date >= from && date <= to
          const disabled = (!!minDate && date < minDate) || (!!maxDate && date > maxDate)

          return (
            <div
              key={date}
              className={cn(
                'py-0.5',
                inRange && 'bg-primary/10',
                (isStart || i === 0 || (i + leading) % 7 === 0) && inRange && 'rounded-l-lg',
                (isEnd || i === daysInMonth - 1 || (i + leading) % 7 === 6) &&
                  inRange &&
                  'rounded-r-lg'
              )}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(date)}
                onMouseEnter={() => onPreviewChange(date)}
                onMouseLeave={() => onPreviewChange(undefined)}
                className={cn(
                  'mx-auto flex size-9 items-center justify-center rounded-lg text-sm outline-none',
                  'transition-colors focus-visible:ring-2 focus-visible:ring-primary/40',
                  'tabular-nums',
                  date > today && 'text-muted-foreground',
                  date === today && !isStart && !isEnd && 'font-semibold ring-1 ring-primary/40',
                  !isStart && !isEnd && !disabled && 'hover:bg-surface-hover',
                  (isStart || isEnd) && 'bg-primary font-semibold text-primary-foreground',
                  disabled && 'pointer-events-none opacity-30'
                )}
              >
                {i + 1}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Two months side by side, picking a range with two clicks (one month on narrow screens) */
export function RangeCalendar({ month, onMonthChange, ...props }: RangeCalendarProps) {
  const shift = (delta: number) =>
    onMonthChange(new Date(month.getFullYear(), month.getMonth() + delta, 1))

  return (
    <div className="flex gap-6">
      <MonthGrid
        month={month}
        prev={() => shift(-1)}
        next={() => shift(1)}
        nextClassName="md:hidden"
        {...props}
      />
      <MonthGrid
        month={new Date(month.getFullYear(), month.getMonth() + 1, 1)}
        next={() => shift(1)}
        className="max-md:hidden"
        {...props}
      />
    </div>
  )
}
