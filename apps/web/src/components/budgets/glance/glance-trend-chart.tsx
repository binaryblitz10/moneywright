import { useEffect, useId, useRef, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatAxisAmount } from '@/components/dashboard/utils'
import { formatBudgetAmount } from '../format'
import { dayLabel, STATUS_COLOR, type GlanceStats } from './glance-stats'

interface GlanceTrendChartProps {
  stats: GlanceStats
  month: string
}

/** How long the tooltip stays on a point before it may move to another one */
const TOOLTIP_HOLD_MS = 200
const TOOLTIP_OFFSET = 16
/** Days past the middle of the month the cursor must go before the tooltip changes side */
const SIDE_GAP_DAYS = 2

interface Hover {
  index: number
  /** Horizontal position of the point, which the tooltip stays level with */
  x: number
}

interface ChartPoint {
  day: number
  spent?: number
  projected?: number
  pace: number
  lastMonth?: number
}

/** Running total of the month's spending against the budget, an even pace and last month */
export function GlanceTrendChart({ stats, month }: GlanceTrendChartProps) {
  const id = useId()
  const { currency, available, spent, status, daysInMonth, daysElapsed } = stats
  const color = STATUS_COLOR[status]

  const data: ChartPoint[] = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1
    return {
      day,
      spent: day <= daysElapsed ? stats.cumulative[i] : undefined,
      // The projection starts from today's total so the two lines join
      projected:
        stats.projected !== null && day >= daysElapsed
          ? spent + stats.avgPerDay * (day - daysElapsed)
          : undefined,
      pace: (available * day) / daysInMonth,
      lastMonth: stats.hasLastMonth ? stats.previousCumulative[i] : undefined,
    }
  })

  const { shown, onRight, onHover, onLeave } = useDwellingHover(daysInMonth)
  const shownPoint = shown === null ? undefined : data[shown.index]

  return (
    <div className="relative -mx-2 h-60 lg:h-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 12, right: 8, left: -8, bottom: 0 }}
          onMouseMove={onHover}
          onMouseLeave={onLeave}
        >
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border-subtle)"
            strokeOpacity={0.5}
            vertical={false}
          />
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11, fontWeight: 500 }}
            tickFormatter={(day: number) => dayLabel(month, day)}
            ticks={[1, 8, 15, 22, daysInMonth]}
            dy={8}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11, fontWeight: 500 }}
            tickFormatter={(value: number) => formatAxisAmount(value, currency)}
            width={60}
          />
          <Tooltip content={() => null} cursor={{ stroke: 'var(--border-hover)' }} />
          <ReferenceLine
            y={available}
            stroke="var(--foreground)"
            strokeOpacity={0.35}
            label={{
              value: `Budget ${formatAxisAmount(available, currency)}`,
              position: 'insideBottomLeft',
              offset: 6,
              fill: 'var(--muted-foreground)',
              fontSize: 11,
            }}
          />
          <Line
            dataKey="pace"
            stroke="var(--muted-foreground)"
            strokeOpacity={0.5}
            strokeDasharray="4 4"
            strokeWidth={1.5}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          {stats.hasLastMonth && (
            <Line
              dataKey="lastMonth"
              stroke="var(--chart-4)"
              strokeOpacity={0.45}
              strokeWidth={1.5}
              dot={false}
              activeDot={false}
              animationDuration={800}
            />
          )}
          <Area
            dataKey="spent"
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#${id}-fill)`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: color }}
            animationDuration={800}
          />
          {stats.projected !== null && (
            <Line
              dataKey="projected"
              stroke={color}
              strokeOpacity={0.6}
              strokeDasharray="5 5"
              strokeWidth={2}
              dot={false}
              activeDot={false}
              animationDuration={800}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      {shown && shownPoint && (
        <div
          className="pointer-events-none absolute top-3 transition-[left] duration-[400ms] ease-out"
          style={{ left: shown.x }}
        >
          <div
            className="w-max transition-transform duration-[400ms] ease-out"
            style={{
              transform: onRight
                ? `translateX(${TOOLTIP_OFFSET}px)`
                : `translateX(calc(-100% - ${TOOLTIP_OFFSET}px))`,
            }}
          >
            <TrendTooltip point={shownPoint} currency={currency} month={month} />
          </div>
        </div>
      )}
    </div>
  )
}

interface ChartMouseState {
  activeTooltipIndex?: number | string | null
  activeCoordinate?: { x: number; y: number }
}

/**
 * Tracks the hovered point, but keeps the tooltip on its current point for at least
 * TOOLTIP_HOLD_MS before switching, so sweeping across neighbouring days doesn't make it flicker
 */
function useDwellingHover(daysInMonth: number): {
  shown: Hover | null
  /** Whether the tooltip sits right of the vertical line, rather than left */
  onRight: boolean
  onHover: (state: ChartMouseState) => void
  onLeave: () => void
} {
  const [shown, setShown] = useState<Hover | null>(null)
  const [onRight, setOnRight] = useState(true)
  const latest = useRef<Hover | null>(null)
  const shownAt = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  const show = (hover: Hover) => {
    clearTimer()
    shownAt.current = Date.now()
    setShown(hover)
    // The side only changes once the cursor is clearly past the middle, so hovering around it
    // doesn't make the tooltip flip back and forth
    setOnRight((right) =>
      right
        ? hover.index <= daysInMonth / 2 + SIDE_GAP_DAYS
        : hover.index < daysInMonth / 2 - SIDE_GAP_DAYS
    )
  }

  useEffect(() => clearTimer, [])

  const onHover = (state: ChartMouseState) => {
    const index = Number(state.activeTooltipIndex)
    const coordinate = state.activeCoordinate
    if (state.activeTooltipIndex == null || Number.isNaN(index) || !coordinate) return
    const hover = { index, x: coordinate.x }
    latest.current = hover
    if (shown === null) return show(hover)
    if (index === shown.index) return clearTimer()
    const wait = TOOLTIP_HOLD_MS - (Date.now() - shownAt.current)
    if (wait <= 0) return show(hover)
    if (!timer.current) {
      timer.current = setTimeout(() => {
        timer.current = null
        if (latest.current) show(latest.current)
      }, wait)
    }
  }

  const onLeave = () => {
    clearTimer()
    latest.current = null
    setShown(null)
  }

  return { shown, onRight, onHover, onLeave }
}

/** Key to the chart's lines */
export function TrendLegend({ stats }: { stats: GlanceStats }) {
  const color = STATUS_COLOR[stats.status]
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <LegendItem color={color} label="Spent" />
      {stats.projected !== null && <LegendItem color={color} label="Projected" dashed />}
      <LegendItem color="var(--muted-foreground)" label="Even pace" dashed />
      {stats.hasLastMonth && <LegendItem color="var(--chart-4)" label="Last month" />}
    </div>
  )
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
      <span
        aria-hidden
        className="h-0 w-5 border-t-2"
        style={{ borderColor: color, borderTopStyle: dashed ? 'dashed' : 'solid' }}
      />
      {label}
    </span>
  )
}

function TrendTooltip({
  point,
  currency,
  month,
}: {
  point: ChartPoint
  currency: string
  month: string
}) {
  const rows: Array<[string, number | undefined]> = [
    ['Total Spent', point.spent],
    ['Projected', point.spent === undefined ? point.projected : undefined],
    ['Even pace', point.pace],
    ['Last month', point.lastMonth],
  ]
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-elevated/95 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {dayLabel(month, point.day)}
      </p>
      <div className="space-y-1.5 text-sm">
        {rows.map(
          ([label, value]) =>
            value !== undefined && (
              <div key={label} className="flex justify-between gap-8">
                <span className="whitespace-nowrap text-muted-foreground">{label}</span>
                <span className="font-semibold tabular-nums">
                  {formatBudgetAmount(value, currency)}
                </span>
              </div>
            )
        )}
      </div>
    </div>
  )
}
