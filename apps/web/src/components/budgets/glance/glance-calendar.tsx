import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { formatBudgetAmount } from '../format'
import { dayLabel, plural, type GlanceStats } from './glance-stats'

interface GlanceCalendarProps {
  stats: GlanceStats
  month: string
  /** Whether `month` is the month we're in now, to mark today */
  isCurrent: boolean
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Every day of the month as a tile, shaded by how it compares with an even daily budget */
export function GlanceCalendar({ stats, month, isCurrent }: GlanceCalendarProps) {
  const { currency, daily, dailyBudget, daysElapsed } = stats
  const money = (amount: number) => formatBudgetAmount(amount, currency)
  const [year, monthNum] = month.split('-').map(Number)
  // Monday-first offset of the 1st
  const offset = (new Date(year!, monthNum! - 1, 1).getDay() + 6) % 7
  const weeks = Math.ceil((offset + daily.length) / 7)
  const soFar = daily.slice(0, daysElapsed)
  const maxDay = Math.max(...soFar, dailyBudget, 1)
  const daysOver = soFar.filter((v) => v > dailyBudget).length

  // Average spend on each weekday so far, to find the busiest one
  const weekdayTotals = Array.from({ length: 7 }, () => ({ total: 0, days: 0 }))
  soFar.forEach((amount, i) => {
    const weekday = weekdayTotals[(offset + i) % 7]!
    weekday.total += amount
    weekday.days += 1
  })
  const busiest = weekdayTotals
    .map((w, i) => ({ index: i, average: w.days > 0 ? w.total / w.days : 0 }))
    .sort((a, b) => b.average - a.average)[0]!

  const tileStyle = (amount: number): CSSProperties | undefined => {
    if (amount <= 0) return undefined
    const tone = amount > dailyBudget ? 'var(--negative)' : 'var(--positive)'
    const strength = 18 + Math.round((amount / maxDay) * 62)
    return { backgroundColor: `color-mix(in srgb, ${tone} ${strength}%, transparent)` }
  }

  return (
    <div className="grid gap-6 lg:h-full lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        {/* On wide screens the tiles stretch to fill the view's fixed height */}
        <div
          className="grid grid-cols-7 gap-1.5 lg:min-h-0 lg:flex-1 lg:grid-rows-[auto_repeat(var(--weeks),minmax(0,1fr))]"
          style={{ '--weeks': weeks } as CSSProperties}
        >
          {WEEKDAYS.map((d) => (
            <span
              key={d}
              className="text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              {d}
            </span>
          ))}
          {Array.from({ length: offset }, (_, i) => (
            <span key={`blank-${i}`} aria-hidden />
          ))}
          {daily.map((amount, i) => {
            const day = i + 1
            const future = day > daysElapsed
            const today = isCurrent && day === daysElapsed
            return (
              <div
                key={day}
                title={future ? dayLabel(month, day) : `${dayLabel(month, day)} · ${money(amount)}`}
                className={cn(
                  'flex aspect-[1.35] flex-col justify-between rounded-lg p-1.5 text-[10px] leading-none lg:aspect-auto',
                  future
                    ? 'border border-dashed border-border-subtle text-muted-foreground/60'
                    : amount <= 0
                      ? 'bg-muted text-muted-foreground'
                      : 'text-foreground',
                  today && 'ring-2 ring-foreground/70 ring-offset-1 ring-offset-card'
                )}
                style={future ? undefined : tileStyle(amount)}
              >
                <span className="font-medium">{day}</span>
                {!future && amount > 0 && (
                  <span className="hidden truncate text-right font-medium tabular-nums sm:block">
                    {formatShort(amount)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <LegendSwatch className="bg-positive/50" label="Within daily budget" />
          <LegendSwatch className="bg-negative/60" label="Over daily budget" />
          <LegendSwatch className="bg-muted" label="No spending" />
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 sm:auto-rows-fr lg:pb-7">
        <CalendarStat
          label="Daily budget"
          value={money(dailyBudget)}
          note={
            stats.safePerDay !== null
              ? `${money(stats.safePerDay)} a day from here`
              : 'An even share of the month'
          }
        />
        <CalendarStat
          label="Days over"
          value={daysElapsed > 0 ? `${daysOver} of ${daysElapsed}` : '–'}
          note="Above the daily budget"
          className={cn(daysOver > daysElapsed / 2 && 'text-negative')}
        />
        <CalendarStat
          label="No-spend days"
          value={String(stats.noSpendDays)}
          note={
            daysElapsed > 0
              ? `Out of ${plural(daysElapsed, 'day')}${isCurrent ? ' so far' : ''}`
              : 'None yet'
          }
          className={cn(stats.noSpendDays > 0 && 'text-positive')}
        />
        <CalendarStat
          label="Busiest weekday"
          value={busiest.average > 0 ? WEEKDAY_NAMES[busiest.index]! : '–'}
          note={busiest.average > 0 ? `${money(busiest.average)} on average` : 'No spending yet'}
        />
      </dl>
    </div>
  )
}

/** Compact amount for a tile, e.g. 1.2k */
function formatShort(amount: number): string {
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return String(Math.round(amount))
}

function CalendarStat({
  label,
  value,
  note,
  className,
}: {
  label: string
  value: string
  note: string
  className?: string
}) {
  return (
    <div className="flex flex-col justify-center rounded-xl border border-border-subtle bg-card/70 px-4 py-3">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={cn('mt-1 text-lg font-semibold tracking-tight tabular-nums', className)}>
        {value}
      </dd>
      <dd className="mt-0.5 truncate text-xs text-muted-foreground">{note}</dd>
    </div>
  )
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn('h-2.5 w-2.5 rounded-[3px]', className)} />
      {label}
    </span>
  )
}
