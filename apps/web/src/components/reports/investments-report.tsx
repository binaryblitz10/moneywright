/**
 * Investments tab: money put into and taken out of investments, per platform, with
 * what the platforms hold today
 */

import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownToLine, Info, LineChart, Scale, TrendingUp, Wallet } from 'lucide-react'
import { InlineEmptyState } from '@/components/ui/empty-state'
import { StatCard, StatCardGrid } from '@/components/ui/stat-card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatAxisAmount, formatCurrency } from '@/components/dashboard/utils'
import { cn } from '@/lib/utils'
import type { InvestmentPlatformRow, InvestmentsReport } from '@/lib/api'
import { ChangeLine } from './change-indicator'
import { NUM_CLASS, ReportCard, TH_CLASS } from './report-card'
import { formatMonth, formatMonthName, formatRange } from './report-utils'

const PUT_IN_COLOR = 'var(--chart-4)'
const TAKEN_OUT_COLOR = 'var(--chart-1)'
const ALLOCATION_COLORS = [
  'var(--chart-4)',
  'var(--chart-1)',
  'var(--chart-5)',
  'var(--chart-3)',
  'var(--chart-2)',
]

function formatAsOf(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatGainPct(fraction: number): string {
  const pct = Math.round(fraction * 1000) / 10
  return `${pct > 0 ? '+' : ''}${pct}%`
}

function gainTone(value: number): string {
  return value > 0 ? 'text-positive' : value < 0 ? 'text-negative' : 'text-muted-foreground'
}

interface InvestmentsReportViewProps {
  report: InvestmentsReport
}

export function InvestmentsReportView({ report }: InvestmentsReportViewProps) {
  const { period, totals, overall, currency } = report
  const comparisonLabel = period.comparison ? formatRange(period.comparison) : null

  if (totals.current.count === 0 && overall.holdingsCount === 0 && !totals.previous?.count) {
    return (
      <InlineEmptyState
        icon={Info}
        title="No investments in this period"
        description="No investment activity was recorded in these months, and no holdings are recorded yet."
      />
    )
  }

  const net = totals.current.putIn - totals.current.takenOut
  const previousNet = totals.previous ? totals.previous.putIn - totals.previous.takenOut : null

  const latestAsOf = report.platforms.reduce<string | null>(
    (latest, p) => (p.asOfDate && (!latest || p.asOfDate > latest) ? p.asOfDate : latest),
    null
  )

  return (
    <div className="space-y-6">
      <StatCardGrid className="lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Invested"
          formatValue={formatCurrency}
          value={totals.current.putIn}
          currency={currency}
          icon={TrendingUp}
          subtitle={
            <ChangeLine
              comparisonLabel={comparisonLabel}
              delta={totals.putInChange?.delta ?? null}
              deltaPct={totals.putInChange?.deltaPct ?? null}
              goodWhen="up"
            />
          }
        />
        <StatCard
          label="Withdrawn"
          formatValue={formatCurrency}
          value={totals.current.takenOut}
          currency={currency}
          icon={ArrowDownToLine}
          subtitle={
            totals.previous
              ? `${formatCurrency(totals.previous.takenOut, currency)} in ${comparisonLabel}`
              : 'No earlier data to compare'
          }
        />
        <StatCard
          label="Net investment"
          formatValue={formatCurrency}
          value={net}
          currency={currency}
          icon={Scale}
          subtitle={
            previousNet !== null
              ? `${formatCurrency(previousNet, currency)} in ${comparisonLabel}`
              : 'Invested less withdrawn'
          }
        />
        <StatCard
          label="Current value"
          formatValue={formatCurrency}
          value={overall.currentValue}
          currency={currency}
          icon={Wallet}
          subtitle={latestAsOf ? `As of ${formatAsOf(latestAsOf)}` : 'No holdings recorded'}
        />
        <StatCard
          label="Total gain"
          formatValue={formatCurrency}
          value={overall.cost > 0 ? overall.gain : undefined}
          currency={currency}
          icon={LineChart}
          subtitle={
            overall.cost > 0 && overall.gainPct !== null ? (
              <span>
                <span className={cn('font-medium', gainTone(overall.gain))}>
                  {formatGainPct(overall.gainPct)}
                </span>{' '}
                on {formatCurrency(overall.cost, currency)} cost
              </span>
            ) : (
              'Cost not known'
            )
          }
        />
      </StatCardGrid>

      <MonthlyChart report={report} />
      <PlatformsTable report={report} />
      <AllocationCard report={report} />
    </div>
  )
}

function MonthlyChart({ report }: InvestmentsReportViewProps) {
  const { byMonth, currency, period } = report
  const sameYear = period.from.substring(0, 4) === period.to.substring(0, 4)
  const hasTakenOut = byMonth.some((m) => m.takenOut > 0)
  const data = useMemo(
    () =>
      byMonth.map((m) => ({
        ...m,
        axisLabel: sameYear ? formatMonthName(m.month) : formatMonth(m.month),
      })),
    [byMonth, sameYear]
  )

  return (
    <ReportCard title="Monthly investment activity">
      <div className="px-2 sm:px-0">
        <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 px-2">
          <LegendItem color={PUT_IN_COLOR} label="Invested" />
          {hasTakenOut && <LegendItem color={TAKEN_OUT_COLOR} label="Withdrawn" />}
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 8, right: 0, left: -16, bottom: 0 }} barGap={2}>
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
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11, fontWeight: 500 }}
              dy={8}
              interval="preserveStartEnd"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11, fontWeight: 500 }}
              tickFormatter={(value: number) => formatAxisAmount(value, currency)}
              width={60}
            />
            <Tooltip
              content={<ChartTooltip currency={currency} />}
              cursor={{ fill: 'var(--surface-hover)', fillOpacity: 0.4 }}
            />
            <Bar
              dataKey="putIn"
              fill={PUT_IN_COLOR}
              radius={[3, 3, 0, 0]}
              maxBarSize={28}
              animationDuration={800}
            />
            {hasTakenOut && (
              <Bar
                dataKey="takenOut"
                fill={TAKEN_OUT_COLOR}
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
                animationDuration={800}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ReportCard>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-6 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </div>
  )
}

function ChartTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean
  payload?: Array<{ payload: InvestmentsReport['byMonth'][number] }>
  currency: string
}) {
  if (!active || !payload?.length) return null
  const month = payload[0]!.payload
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-elevated/95 backdrop-blur-xl p-4 shadow-2xl shadow-black/20">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {formatMonth(month.month)}
      </p>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-8">
          <span className="text-muted-foreground">Invested</span>
          <span className="font-semibold tabular-nums">
            {formatCurrency(month.putIn, currency)}
          </span>
        </div>
        {month.takenOut > 0 && (
          <div className="flex justify-between gap-8">
            <span className="text-muted-foreground">Withdrawn</span>
            <span className="font-semibold tabular-nums">
              {formatCurrency(month.takenOut, currency)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function PlatformsTable({ report }: InvestmentsReportViewProps) {
  const { platforms, unmatched, currency, period } = report
  const compared = period.comparison !== null

  const money = (value: number | null) => (value === null ? '–' : formatCurrency(value, currency))

  return (
    <ReportCard title="Platform summary">
      {platforms.length === 0 ? (
        <InlineEmptyState
          icon={Info}
          title="No platforms to show"
          description="Add an investment source, or import holdings, to see them here."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={TH_CLASS}>Platform</TableHead>
              <TableHead className={cn(TH_CLASS, 'text-right')}>Invested</TableHead>
              <TableHead className={cn(TH_CLASS, 'text-right')}>Withdrawn</TableHead>
              <TableHead className={cn(TH_CLASS, 'text-right')}>Net investment, all time</TableHead>
              <TableHead className={cn(TH_CLASS, 'text-right')}>Current value</TableHead>
              <TableHead className={cn(TH_CLASS, 'text-right')}>Cost</TableHead>
              <TableHead className={cn(TH_CLASS, 'text-right')}>Gain</TableHead>
              <TableHead className={TH_CLASS}>Valuation date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {platforms.map((p) => (
              <PlatformRow key={p.sourceId} platform={p} compared={compared} money={money} />
            ))}
          </TableBody>
        </Table>
      )}
      {unmatched.count > 0 && (
        <p className="mt-3 px-2 text-xs text-muted-foreground">
          {formatCurrency(unmatched.putIn, currency)} invested through {unmatched.count}{' '}
          {unmatched.count === 1 ? 'payment' : 'payments'} not linked to a platform. These are
          included in the totals above.
        </p>
      )}
    </ReportCard>
  )
}

function PlatformRow({
  platform: p,
  compared,
  money,
}: {
  platform: InvestmentPlatformRow
  compared: boolean
  money: (value: number | null) => string
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        <span className="block max-w-56 truncate">{p.name}</span>
        {p.institution && p.institution !== p.name && (
          <span className="block text-[10px] font-normal text-muted-foreground">
            {p.institution}
          </span>
        )}
      </TableCell>
      <TableCell className={NUM_CLASS}>
        <span className="block">{money(p.putIn)}</span>
        {compared && p.previousPutIn !== null && (
          <span className="block text-[10px] text-muted-foreground">
            prior period {money(p.previousPutIn)}
          </span>
        )}
      </TableCell>
      <TableCell className={cn(NUM_CLASS, 'text-muted-foreground')}>{money(p.takenOut)}</TableCell>
      <TableCell className={NUM_CLASS}>{money(p.netSinceStart)}</TableCell>
      <TableCell className={cn(NUM_CLASS, 'font-medium')}>{money(p.currentValue)}</TableCell>
      <TableCell className={cn(NUM_CLASS, 'text-muted-foreground')}>{money(p.cost)}</TableCell>
      <TableCell className={NUM_CLASS}>
        {p.gain === null ? (
          '–'
        ) : (
          <>
            <span className={cn('block', gainTone(p.gain))}>{money(p.gain)}</span>
            {p.gainPct !== null && (
              <span className={cn('block text-[10px]', gainTone(p.gain))}>
                {formatGainPct(p.gainPct)}
              </span>
            )}
          </>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {p.asOfDate ? formatAsOf(p.asOfDate) : '–'}
      </TableCell>
    </TableRow>
  )
}

function AllocationCard({ report }: InvestmentsReportViewProps) {
  const { allocation, currency } = report
  if (allocation.length === 0) return null

  return (
    <ReportCard title="Allocation">
      <ul className="space-y-3 px-2">
        {allocation.map((row, index) => (
          <li key={row.type}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{row.label}</span>
              <span className="tabular-nums">
                {formatCurrency(row.value, currency)}
                <span className="ml-2 text-xs text-muted-foreground">
                  {Math.round(row.share * 100)}%
                </span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-elevated">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(row.share * 100, 1)}%`,
                  backgroundColor: ALLOCATION_COLORS[index % ALLOCATION_COLORS.length],
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </ReportCard>
  )
}
