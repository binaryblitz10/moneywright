import { useMemo, useCallback } from 'react'
import {
  ComposedChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { MonthlyTrendData } from '@/lib/api'
import { cn } from '@/lib/utils'
import { formatAxisAmount } from './utils'
import { TrendingDown, TrendingUp, Activity } from 'lucide-react'

// Colours match the Tailwind emerald/rose/blue/violet 500 shades (also --chart-1/4/5)
const INCOME_COLOR = 'rgb(16, 185, 129)'
const EXPENSES_COLOR = 'rgb(244, 63, 94)'
const INVESTED_COLOR = 'var(--chart-4)'
const RATE_COLOR = 'var(--chart-5)'

// Months the range doesn't fully cover are drawn lighter
const PARTIAL_OPACITY = 0.45

interface MonthlyTrendsChartProps {
  data: MonthlyTrendData[]
  currency: string
  isLoading?: boolean
  className?: string
  onMonthClick?: (month: MonthlyTrendData) => void
}

// Format full currency for tooltip
function formatFullCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatPercent(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`
}

// "Oct 26 (to 15 Oct)" for months cut short by the range, otherwise the plain label
function describeMonth(m: MonthlyTrendData): string {
  if (!m.isPartial || !m.throughDate) return m.monthLabel
  const through = new Date(`${m.throughDate}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
  return `${m.monthLabel} (to ${through})`
}

// Custom Tooltip Component
function CustomTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean
  payload?: Array<{ payload: MonthlyTrendData }>
  currency: string
}) {
  if (!active || !payload || !payload.length) return null

  const month = payload[0]!.payload
  const { income, expenses, invested, surplus, savingsRate } = month

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-elevated/95 backdrop-blur-xl p-4 shadow-2xl shadow-black/20">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        {describeMonth(month)}
      </p>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-8">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
            <span className="text-sm text-muted-foreground">Income</span>
          </div>
          <span className="text-sm font-semibold text-emerald-400 tabular-nums">
            {formatFullCurrency(income, currency)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-8">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50" />
            <span className="text-sm text-muted-foreground">Expenses</span>
          </div>
          <span className="text-sm font-semibold text-rose-400 tabular-nums">
            {formatFullCurrency(expenses, currency)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-8">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" />
            <span className="text-sm text-muted-foreground">Invested</span>
          </div>
          <span className="text-sm font-semibold text-blue-400 tabular-nums">
            {formatFullCurrency(invested, currency)}
          </span>
        </div>
        <div className="h-px bg-linear-to-r from-transparent via-border-subtle to-transparent my-1" />
        <div className="flex items-center justify-between gap-8">
          <div className="flex items-center gap-2">
            {surplus >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
            )}
            <span className="text-sm font-medium text-foreground">Surplus</span>
          </div>
          <span
            className={cn(
              'text-sm font-bold tabular-nums',
              surplus >= 0 ? 'text-emerald-400' : 'text-rose-400'
            )}
          >
            {surplus >= 0 ? '+' : ''}
            {formatFullCurrency(surplus, currency)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-8">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-violet-500 shadow-sm shadow-violet-500/50" />
            <span className="text-sm text-muted-foreground">Savings rate</span>
          </div>
          <span className="text-sm font-semibold text-violet-400 tabular-nums">
            {formatPercent(savingsRate)}
          </span>
        </div>
      </div>
    </div>
  )
}

// Custom Legend
function CustomLegend({ hasPartial }: { hasPartial: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mb-4">
      <div className="flex items-center gap-2">
        <div className="h-2 w-6 rounded-full bg-linear-to-r from-emerald-500/80 to-emerald-400" />
        <span className="text-xs font-medium text-muted-foreground">Income</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2 w-6 rounded-full bg-linear-to-r from-rose-500/80 to-rose-400" />
        <span className="text-xs font-medium text-muted-foreground">Expenses</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2 w-6 rounded-full bg-linear-to-r from-blue-500/80 to-blue-400" />
        <span className="text-xs font-medium text-muted-foreground">Invested</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-0.5 w-6 rounded-full bg-violet-500" />
        <span className="text-xs font-medium text-muted-foreground">Savings rate</span>
      </div>
      {hasPartial && (
        <span className="text-xs text-muted-foreground">* Partial month (lighter bars)</span>
      )}
    </div>
  )
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

export function MonthlyTrendsChart({
  data,
  currency,
  isLoading,
  className,
  onMonthClick,
}: MonthlyTrendsChartProps) {
  // Calculate max value for Y-axis domain
  const maxValue = useMemo(() => {
    if (!data.length) return 100000
    const max = Math.max(...data.flatMap((d) => [d.income, d.expenses, d.invested]))
    // Round up to a nice number
    const magnitude = Math.pow(10, Math.floor(Math.log10(max)))
    return Math.ceil(max / magnitude) * magnitude
  }, [data])

  // Savings rate in percent for the right axis; very negative months are clamped to keep the axis readable
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        axisLabel: d.isPartial ? `${d.monthLabel}*` : d.monthLabel,
        savingsRatePct: d.savingsRate === null ? null : Math.max(d.savingsRate * 100, -100),
      })),
    [data]
  )
  const hasPartial = data.some((d) => d.isPartial)
  const rateMin = useMemo(() => {
    const lowest = Math.min(0, ...chartData.map((d) => d.savingsRatePct ?? 0))
    return Math.floor(lowest / 25) * 25
  }, [chartData])

  // Handle chart click
  const handleChartClick = useCallback(
    (state: { activeTooltipIndex?: number }) => {
      if (state?.activeTooltipIndex !== undefined && onMonthClick) {
        const clickedMonth = data[state.activeTooltipIndex]
        if (clickedMonth) {
          onMonthClick(clickedMonth)
        }
      }
    },
    [data, onMonthClick]
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

  return (
    <div className={cn('w-full', className)}>
      <CustomLegend hasPartial={hasPartial} />
      <div className="[&_svg]:outline-none [&_svg:focus]:outline-none [&_g:focus]:outline-none [&_path:focus]:outline-none [&_.recharts-surface]:outline-none [&_*:focus]:outline-none">
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 0, left: -16, bottom: 0 }}
            barGap={2}
            onClick={handleChartClick as unknown as undefined}
            style={{ cursor: onMonthClick ? 'pointer' : 'default', outline: 'none' }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border-subtle)"
              strokeOpacity={0.5}
              vertical={false}
            />

            <XAxis
              dataKey="axisLabel"
              axisLine={false}
              tickLine={false}
              tick={{
                fill: 'var(--muted-foreground)',
                fontSize: 11,
                fontWeight: 500,
              }}
              dy={8}
              interval="preserveStartEnd"
              tickCount={6}
            />

            <YAxis
              yAxisId="amount"
              axisLine={false}
              tickLine={false}
              tick={{
                fill: 'var(--muted-foreground)',
                fontSize: 11,
                fontWeight: 500,
              }}
              tickFormatter={(value) => formatAxisAmount(value, currency)}
              domain={[0, maxValue]}
              width={60}
            />

            <YAxis
              yAxisId="rate"
              orientation="right"
              axisLine={false}
              tickLine={false}
              tick={{
                fill: 'var(--muted-foreground)',
                fontSize: 11,
                fontWeight: 500,
              }}
              tickFormatter={(value) => `${value}%`}
              domain={[rateMin, 100]}
              width={44}
            />

            <Tooltip
              content={<CustomTooltip currency={currency} />}
              cursor={{ fill: 'var(--surface-hover)', fillOpacity: 0.4 }}
            />

            <Bar
              yAxisId="amount"
              dataKey="income"
              fill={INCOME_COLOR}
              radius={[3, 3, 0, 0]}
              maxBarSize={18}
              animationDuration={800}
            >
              {chartData.map((d) => (
                <Cell key={d.month} fillOpacity={d.isPartial ? PARTIAL_OPACITY : 1} />
              ))}
            </Bar>
            <Bar
              yAxisId="amount"
              dataKey="expenses"
              fill={EXPENSES_COLOR}
              radius={[3, 3, 0, 0]}
              maxBarSize={18}
              animationDuration={800}
            >
              {chartData.map((d) => (
                <Cell key={d.month} fillOpacity={d.isPartial ? PARTIAL_OPACITY : 1} />
              ))}
            </Bar>
            <Bar
              yAxisId="amount"
              dataKey="invested"
              fill={INVESTED_COLOR}
              radius={[3, 3, 0, 0]}
              maxBarSize={18}
              animationDuration={800}
            >
              {chartData.map((d) => (
                <Cell key={d.month} fillOpacity={d.isPartial ? PARTIAL_OPACITY : 1} />
              ))}
            </Bar>

            {/* Savings rate (null months leave a gap) */}
            <Line
              yAxisId="rate"
              type="linear"
              dataKey="savingsRatePct"
              stroke={RATE_COLOR}
              strokeWidth={2}
              dot={{ r: 3, fill: RATE_COLOR, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              connectNulls={false}
              animationDuration={800}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
