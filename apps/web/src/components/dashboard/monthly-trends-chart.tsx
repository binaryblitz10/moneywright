import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Activity } from 'lucide-react'
import type { MonthlyTrendData } from '@/lib/api'
import { cn } from '@/lib/utils'
import { formatCompact } from './utils'
import { formatScaleTick, niceScale } from './chart-scale'
import { describeMonth, formatPercent, formatThroughDate } from './trend-format'
import { MonthTooltip } from './month-tooltip'
import { TrendInsights } from './trend-insights'

// Colours match the Tailwind emerald/rose/blue 500 shades (blue is also --chart-4)
const INCOME_COLOR = 'rgb(16, 185, 129)'
const EXPENSES_COLOR = 'rgb(244, 63, 94)'
const INVESTED_COLOR = 'var(--chart-4)'

const AMOUNT_HEIGHT = 220
const NET_HEIGHT = 140
// Room above/below a plot for the value tags of clipped bars
const TAG_ROOM = 24
const TOOLTIP_WIDTH = 240
// Beyond this many months the savings-rate row would not fit; the tooltip still shows it
const MAX_MONTHS_FOR_RATE_ROW = 12
const MAX_X_LABELS = 12

type Series = 'income' | 'expenses' | 'invested' | 'average'

interface MonthlyTrendsChartProps {
  data: MonthlyTrendData[]
  currency: string
  isLoading?: boolean
  className?: string
  onMonthClick?: (month: MonthlyTrendData) => void
  getCategoryLabel?: (code: string) => string
}

// Months the range doesn't fully cover are hatched instead of solid
function fillFor(color: string, partial: boolean): CSSProperties {
  if (!partial) return { background: color }
  return {
    background: `repeating-linear-gradient(135deg, ${color} 0 3px, color-mix(in srgb, ${color} 30%, transparent) 3px 6px)`,
  }
}

// A transparent diagonal gap near the top marks a bar that continues past the axis
const BREAK_MASK =
  'linear-gradient(172deg, #000 0, #000 20px, transparent 20px, transparent 24px, #000 24px)'

// The bar's colour, hatched for partial months and with the break mark when clipped. It is its own
// layer so the mask never clips the value tag.
function BarFill({
  color,
  partial,
  clipped,
}: {
  color: string
  partial: boolean
  clipped: boolean
}) {
  return (
    <div
      className="absolute inset-0 rounded-[inherit]"
      style={{
        ...fillFor(color, partial),
        ...(clipped ? { maskImage: BREAK_MASK, WebkitMaskImage: BREAK_MASK } : null),
      }}
    />
  )
}

// Shows the real value of a clipped bar, at the end that runs off the axis
function ValueTag({
  children,
  color,
  placement,
}: {
  children: ReactNode
  color: string
  placement: 'above' | 'below'
}) {
  return (
    <span
      className={cn(
        'absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md px-1.5 py-px text-[10px] font-bold leading-tight text-foreground tabular-nums',
        placement === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'
      )}
      style={{ background: `color-mix(in srgb, ${color} 22%, var(--background))` }}
    >
      {children}
    </span>
  )
}

// Custom Legend: chips that switch series on and off
function LegendChip({
  active,
  onToggle,
  label,
  swatch,
}: {
  active: boolean
  onToggle: () => void
  label: string
  swatch: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border-subtle px-3 py-1 text-xs font-medium transition-colors hover:bg-surface-hover',
        active ? 'text-foreground' : 'text-muted-foreground'
      )}
    >
      <span className={cn('inline-flex transition-opacity', !active && 'opacity-30')}>
        {swatch}
      </span>
      {label}
    </button>
  )
}

function Swatch({ color }: { color: string }) {
  return <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
}

// Loading Skeleton
function ChartSkeleton() {
  return (
    <div className="w-full h-70 flex flex-col">
      {/* Legend skeleton */}
      <div className="flex items-center justify-center gap-6 mb-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-6 rounded-full bg-surface-hover animate-pulse" />
          <div className="h-3 w-12 rounded bg-surface-hover animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-6 rounded-full bg-surface-hover animate-pulse" />
          <div className="h-3 w-14 rounded bg-surface-hover animate-pulse" />
        </div>
      </div>
      {/* Chart area skeleton */}
      <div className="flex-1 relative overflow-hidden rounded-lg">
        <div className="absolute inset-0 bg-linear-to-t from-surface-hover/30 to-transparent animate-pulse" />
        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-linear-to-t from-surface-hover/50 to-transparent animate-pulse" />
        {/* Fake bars */}
        <div className="absolute bottom-8 left-0 right-0 flex items-end justify-around gap-2 px-8">
          {[40, 65, 45, 80, 55, 70, 50, 85, 60, 75, 45, 90].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-surface-hover animate-pulse"
              style={{
                height: `${h}%`,
                animationDelay: `${i * 50}ms`,
              }}
            />
          ))}
        </div>
        {/* X-axis skeleton */}
        <div className="absolute bottom-0 left-0 right-0 h-6 flex items-center justify-around px-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-2.5 w-8 rounded bg-surface-hover animate-pulse"
              style={{ animationDelay: `${i * 100}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// Empty State
function EmptyState() {
  return (
    <div className="w-full h-70 flex flex-col items-center justify-center">
      <div className="relative">
        <div className="absolute inset-0 bg-linear-to-r from-emerald-500/20 to-rose-500/20 blur-2xl rounded-full" />
        <div className="relative p-4 rounded-2xl bg-surface-elevated border border-border-subtle">
          <Activity className="h-8 w-8 text-muted-foreground" />
        </div>
      </div>
      <p className="mt-4 text-sm font-medium text-foreground">No trend data yet</p>
      <p className="mt-1 text-xs text-muted-foreground text-center max-w-50">
        Upload statements to see your income and expense trends
      </p>
    </div>
  )
}

interface PlotProps {
  height: number
  /** Axis labels and gridlines, as a position from the bottom (0-100) */
  lines: { position: number; label: string; zero?: boolean }[]
  columns: number
  /** Drawn over the month columns without catching the pointer */
  overlay?: ReactNode
  children: ReactNode
}

// A y-axis plus a plot area with gridlines; the children are the month columns
function Plot({ height, lines, columns, overlay, children }: PlotProps) {
  return (
    <div
      className="grid grid-cols-[40px_1fr] sm:grid-cols-[48px_1fr]"
      style={{ paddingTop: TAG_ROOM, paddingBottom: TAG_ROOM }}
    >
      <div className="relative" style={{ height }} aria-hidden>
        {lines.map((line) => (
          <span
            key={line.position}
            className="absolute right-2 translate-y-1/2 text-[11px] font-medium text-muted-foreground tabular-nums whitespace-nowrap"
            style={{ bottom: `${line.position}%` }}
          >
            {line.label}
          </span>
        ))}
      </div>
      <div className="relative" style={{ height }}>
        {lines.map((line) => (
          <div
            key={line.position}
            aria-hidden
            className={cn(
              'absolute inset-x-0 border-t pointer-events-none',
              line.zero ? 'border-muted-foreground/40' : 'border-border-subtle/70 border-dashed'
            )}
            style={{ bottom: `${line.position}%` }}
          />
        ))}
        <div
          className="absolute inset-0 grid"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {children}
        </div>
        {overlay}
      </div>
    </div>
  )
}

interface MonthColumnProps {
  active: boolean
  onActivate: (el: HTMLElement) => void
  onSelect?: () => void
  /** The first plot's columns are the keyboard-focusable ones */
  focusable?: boolean
  label?: string
  children: ReactNode
}

function MonthColumn({
  active,
  onActivate,
  onSelect,
  focusable,
  label,
  children,
}: MonthColumnProps) {
  return (
    <div
      role={focusable && onSelect ? 'button' : undefined}
      tabIndex={focusable && onSelect ? 0 : undefined}
      aria-label={focusable ? label : undefined}
      className={cn(
        'relative rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active && 'bg-surface-hover/70',
        onSelect && 'cursor-pointer'
      )}
      onMouseEnter={(e) => onActivate(e.currentTarget)}
      onFocus={(e) => focusable && onActivate(e.currentTarget)}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      {children}
    </div>
  )
}

export function MonthlyTrendsChart({
  data,
  currency,
  isLoading,
  className,
  onMonthClick,
  getCategoryLabel = (code) => code,
}: MonthlyTrendsChartProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState<Record<Series, boolean>>({
    income: true,
    expenses: true,
    invested: true,
    average: true,
  })
  const [hover, setHover] = useState<{ index: number; left: number } | null>(null)

  const toggle = (series: Series) => setShown((s) => ({ ...s, [series]: !s[series] }))

  const averageExpenses = useMemo(
    () => (data.length ? data.reduce((sum, d) => sum + d.expenses, 0) / data.length : 0),
    [data]
  )

  const amountScale = useMemo(
    () =>
      niceScale(
        data.flatMap((d) => [
          shown.income ? d.income : 0,
          shown.expenses ? d.expenses : 0,
          shown.invested ? d.invested : 0,
        ]),
        3
      ),
    [data, shown.income, shown.expenses, shown.invested]
  )
  const netScale = useMemo(
    () =>
      niceScale(
        data.map((d) => Math.abs(d.surplus)),
        2
      ),
    [data]
  )

  if (isLoading) {
    return (
      <div className={cn('w-full', className)}>
        <ChartSkeleton />
      </div>
    )
  }

  // Check if all data points are zero
  const hasData = data.some((d) => d.income > 0 || d.expenses > 0 || d.invested > 0)

  if (!data.length || !hasData) {
    return (
      <div className={cn('w-full', className)}>
        <EmptyState />
      </div>
    )
  }

  const columns = data.length
  const labelEvery = Math.ceil(columns / MAX_X_LABELS)

  const amountLines = amountScale.ticks.map((tick) => ({
    position: (tick / amountScale.max) * 100,
    label: formatScaleTick(tick, amountScale.max, currency),
    zero: tick === 0,
  }))
  const netLines = [
    ...netScale.ticks
      .slice(1)
      .reverse()
      .map((tick) => ({
        position: 50 + (tick / netScale.max) * 50,
        label: `+${formatScaleTick(tick, netScale.max, currency)}`,
      })),
    { position: 50, label: formatScaleTick(0, netScale.max, currency), zero: true },
    ...netScale.ticks.slice(1).map((tick) => ({
      position: 50 - (tick / netScale.max) * 50,
      label: `−${formatScaleTick(tick, netScale.max, currency)}`,
    })),
  ]

  const activate = (index: number) => (el: HTMLElement) => {
    const chart = chartRef.current
    if (!chart) return
    const chartBox = chart.getBoundingClientRect()
    const box = el.getBoundingClientRect()
    // Open towards the side with more room
    const right = box.right - chartBox.left + 8
    const left =
      right + TOOLTIP_WIDTH <= chartBox.width ? right : box.left - chartBox.left - 8 - TOOLTIP_WIDTH
    setHover({ index, left: Math.max(0, left) })
  }

  const hovered = hover ? data[hover.index] : undefined

  const amountBar = (value: number, color: string, partial: boolean, series: Series) => {
    if (!shown[series]) return null
    const isClipped = value > amountScale.max
    return (
      <div
        key={series}
        className="relative flex-1 max-w-5 rounded-t-[5px]"
        style={{ height: `${(Math.min(value, amountScale.max) / amountScale.max) * 100}%` }}
      >
        <BarFill color={color} partial={partial} clipped={isClipped} />
        {isClipped && (
          <ValueTag color={color} placement="above">
            {formatCompact(value, currency)}
          </ValueTag>
        )}
      </div>
    )
  }

  return (
    <div className={cn('w-full', className)}>
      <TrendInsights data={data} currency={currency} />

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <LegendChip
          active={shown.income}
          onToggle={() => toggle('income')}
          label="Income"
          swatch={<Swatch color={INCOME_COLOR} />}
        />
        <LegendChip
          active={shown.expenses}
          onToggle={() => toggle('expenses')}
          label="Expenses"
          swatch={<Swatch color={EXPENSES_COLOR} />}
        />
        <LegendChip
          active={shown.invested}
          onToggle={() => toggle('invested')}
          label="Invested"
          swatch={<Swatch color={INVESTED_COLOR} />}
        />
        <LegendChip
          active={shown.average}
          onToggle={() => toggle('average')}
          label={`Avg spend ${formatCompact(averageExpenses, currency)}/mo`}
          swatch={<span className="w-3.5 border-t-2 border-dashed border-muted-foreground" />}
        />
      </div>

      <div ref={chartRef} className="relative" onMouseLeave={() => setHover(null)}>
        <p className="mt-3 pl-10 sm:pl-12 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Income vs expenses
        </p>
        <Plot
          height={AMOUNT_HEIGHT}
          lines={amountLines}
          columns={columns}
          overlay={
            shown.average &&
            averageExpenses > 0 &&
            averageExpenses <= amountScale.max && (
              <div
                aria-hidden
                className="absolute inset-x-0 border-t-[1.5px] border-dashed border-muted-foreground pointer-events-none"
                style={{ bottom: `${(averageExpenses / amountScale.max) * 100}%` }}
              />
            )
          }
        >
          {data.map((d, i) => (
            <MonthColumn
              key={d.month}
              focusable
              active={hover?.index === i}
              onActivate={activate(i)}
              onSelect={onMonthClick && (() => onMonthClick(d))}
              label={`${describeMonth(d)}: income ${formatCompact(d.income, currency)}, expenses ${formatCompact(d.expenses, currency)}, savings rate ${formatPercent(d.savingsRate)}`}
            >
              <div className="absolute inset-0 flex items-end justify-center gap-[3px] px-1 sm:px-1.5">
                {amountBar(d.income, INCOME_COLOR, d.isPartial, 'income')}
                {amountBar(d.expenses, EXPENSES_COLOR, d.isPartial, 'expenses')}
                {amountBar(d.invested, INVESTED_COLOR, d.isPartial, 'invested')}
              </div>
            </MonthColumn>
          ))}
        </Plot>

        <p className="pl-10 sm:pl-12 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Net surplus
        </p>
        <Plot height={NET_HEIGHT} lines={netLines} columns={columns}>
          {data.map((d, i) => {
            const positive = d.surplus >= 0
            const color = positive ? INCOME_COLOR : EXPENSES_COLOR
            const isClipped = Math.abs(d.surplus) > netScale.max
            return (
              <MonthColumn
                key={d.month}
                active={hover?.index === i}
                onActivate={activate(i)}
                onSelect={onMonthClick && (() => onMonthClick(d))}
              >
                <div
                  className={cn(
                    'absolute left-1/2 w-3.5 sm:w-5 -translate-x-1/2',
                    positive ? 'bottom-1/2 rounded-t-[5px]' : 'top-1/2 rounded-b-[5px]'
                  )}
                  style={{
                    height: `${(Math.min(Math.abs(d.surplus), netScale.max) / netScale.max) * 50}%`,
                  }}
                >
                  <BarFill color={color} partial={d.isPartial} clipped={isClipped} />
                  {isClipped && (
                    <ValueTag color={color} placement={positive ? 'above' : 'below'}>
                      {positive ? '+' : '−'}
                      {formatCompact(Math.abs(d.surplus), currency)}
                    </ValueTag>
                  )}
                </div>
              </MonthColumn>
            )
          })}
        </Plot>

        {/* Month labels */}
        <div className="grid grid-cols-[40px_1fr] sm:grid-cols-[48px_1fr]">
          <span />
          <div
            className="grid text-center"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {data.map((d, i) => (
              <div
                key={d.month}
                className={cn(
                  'text-[11px] sm:text-xs font-medium leading-tight',
                  hover?.index === i ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {i % labelEvery === 0 && (
                  <>
                    {d.monthLabel}
                    {d.isPartial && '*'}
                    {d.isPartial && d.throughDate && (
                      <span className="block text-[10px] font-normal opacity-80">
                        to {formatThroughDate(d.throughDate)}
                      </span>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Savings rate */}
        {columns <= MAX_MONTHS_FOR_RATE_ROW && (
          <div className="grid grid-cols-[40px_1fr] sm:grid-cols-[48px_1fr] items-center mt-3">
            <span className="pr-2 text-right text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
              Savings rate
            </span>
            <div
              className="grid justify-items-center"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {data.map((d) => (
                <span
                  key={d.month}
                  className={cn(
                    'rounded-full px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-bold text-foreground tabular-nums',
                    d.savingsRate === null
                      ? 'text-muted-foreground'
                      : d.savingsRate >= 0.2
                        ? 'bg-emerald-500/15'
                        : d.savingsRate >= 0
                          ? 'bg-amber-500/15'
                          : 'bg-rose-500/15'
                  )}
                >
                  {formatPercent(d.savingsRate)}
                </span>
              ))}
            </div>
          </div>
        )}

        {hover && hovered && (
          <div
            className="pointer-events-none absolute top-8 z-20"
            style={{ left: hover.left, width: TOOLTIP_WIDTH }}
          >
            <MonthTooltip
              month={hovered}
              previous={data[hover.index - 1]}
              averageExpenses={averageExpenses}
              currency={currency}
              getCategoryLabel={getCategoryLabel}
              className="w-full"
            />
          </div>
        )}
      </div>
    </div>
  )
}
