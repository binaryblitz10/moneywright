/**
 * Spending trends tab: expense spend month by month, by category (heatmap), shop and account
 */

import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InlineEmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency } from '@/components/dashboard/utils'
import { getCategoryColorClasses, getCategoryFillColor } from '@/lib/category-colors'
import { cn } from '@/lib/utils'
import type { ReportShopTrendRow, TrendsReport } from '@/lib/api'
import { NUM_CLASS, ReportCard, TH_CLASS } from './report-card'
import { formatMonthName, monthDates } from './report-utils'

const TOP_SHOPS = 15
/** Share of the cell colour at a row's smallest and largest month */
const MIN_SHADE = 8
const MAX_SHADE = 60

interface SpendingTrendsViewProps {
  report: TrendsReport
  getCategoryColor: (code: string) => string
}

export function SpendingTrendsView({ report, getCategoryColor }: SpendingTrendsViewProps) {
  if (report.total === 0 && report.categories.length === 0) {
    return (
      <InlineEmptyState
        icon={Info}
        title="No spending in this period"
        description="Pick another period, or upload statements that cover it."
      />
    )
  }

  return (
    <div className="space-y-6">
      <CategoryHeatmap report={report} getCategoryColor={getCategoryColor} />
      <ShopsTable report={report} />
      <AccountsMatrix report={report} />
    </div>
  )
}

/** Column headers for the months: full month name with the year beneath */
function MonthHeads({ months }: { months: string[] }) {
  return (
    <>
      {months.map((month) => (
        <TableHead key={month} className={cn(TH_CLASS, 'text-right')}>
          <span className="block">{formatMonthName(month)}</span>
          <span className="block text-[10px] font-normal tracking-normal">
            {month.substring(0, 4)}
          </span>
        </TableHead>
      ))}
    </>
  )
}

const STICKY_CELL = 'sticky left-0 z-10 bg-card'

function CategoryHeatmap({ report, getCategoryColor }: SpendingTrendsViewProps) {
  const { months, currency } = report
  const range = {
    startDate: monthDates(report.from).startDate,
    endDate: monthDates(report.to).endDate,
  }

  return (
    <ReportCard
      title="Spending by category"
      description="Darker months are that category's highest. Click a figure to see its transactions."
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={cn(TH_CLASS, STICKY_CELL)}>Category</TableHead>
            <MonthHeads months={months} />
            <TableHead className={cn(TH_CLASS, 'text-right')}>Monthly average</TableHead>
            <TableHead className={cn(TH_CLASS, 'text-right')}>Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.categories.map((row) => {
            const color = getCategoryColor(row.key)
            const fill = getCategoryFillColor(color)
            const max = Math.max(...row.months, 0)
            return (
              <TableRow key={row.key}>
                <TableCell className={cn('font-medium', STICKY_CELL)}>
                  <Link
                    to="/transactions"
                    search={{ category: row.key, ...range }}
                    className="flex items-center gap-2 whitespace-nowrap hover:underline"
                  >
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full shrink-0',
                        getCategoryColorClasses(color).dot
                      )}
                    />
                    {row.label}
                  </Link>
                </TableCell>
                {row.months.map((amount, i) => {
                  const month = months[i]!
                  const shade =
                    amount > 0 && max > 0 ? MIN_SHADE + (MAX_SHADE - MIN_SHADE) * (amount / max) : 0
                  return (
                    <TableCell
                      key={month}
                      className={cn(NUM_CLASS, 'p-1')}
                      title={`${row.label}, ${formatMonthName(month)} ${month.substring(0, 4)}`}
                    >
                      {amount === 0 ? (
                        <span className="text-muted-foreground">–</span>
                      ) : (
                        <Link
                          to="/transactions"
                          search={{ category: row.key, ...monthDates(month) }}
                          className="block rounded-md px-2 py-1.5 hover:ring-1 hover:ring-border"
                          style={{
                            backgroundColor:
                              shade > 0
                                ? `color-mix(in srgb, ${fill} ${shade}%, transparent)`
                                : undefined,
                          }}
                        >
                          {formatCurrency(amount, currency)}
                        </Link>
                      )}
                    </TableCell>
                  )
                })}
                <TableCell className={cn(NUM_CLASS, 'text-muted-foreground')}>
                  {formatCurrency(row.average, currency)}
                </TableCell>
                <TableCell className={cn(NUM_CLASS, 'font-medium')}>
                  {formatCurrency(row.total, currency)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className={cn('font-semibold', STICKY_CELL, 'bg-muted')}>Total</TableCell>
            {report.monthTotals.map((amount, i) => (
              <TableCell key={months[i]} className={cn(NUM_CLASS, 'font-semibold')}>
                {formatCurrency(amount, currency)}
              </TableCell>
            ))}
            <TableCell className={cn(NUM_CLASS, 'font-semibold')}>
              {formatCurrency(report.average, currency)}
            </TableCell>
            <TableCell className={cn(NUM_CLASS, 'font-semibold')}>
              {formatCurrency(report.total, currency)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </ReportCard>
  )
}

/** Small bars, one per month, scaled to the shop's highest month */
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 0)
  const width = 6
  const gap = 2
  const height = 24
  return (
    <svg
      width={values.length * (width + gap) - gap}
      height={height}
      className="text-primary"
      role="img"
      aria-label="Spending by month"
    >
      {values.map((value, i) => {
        const barHeight = max > 0 && value > 0 ? Math.max(2, (value / max) * height) : 1
        return (
          <rect
            key={i}
            x={i * (width + gap)}
            y={height - barHeight}
            width={width}
            height={barHeight}
            rx={1}
            fill="currentColor"
            opacity={value > 0 ? 0.7 : 0.2}
          />
        )
      })}
    </svg>
  )
}

const TREND_STYLES = {
  rising: { label: 'Rising', className: 'bg-negative-muted text-negative' },
  falling: { label: 'Falling', className: 'bg-positive-muted text-positive' },
  steady: { label: 'Steady', className: 'bg-surface-elevated text-muted-foreground' },
} as const

function TrendPill({ trend }: { trend: ReportShopTrendRow['trend'] }) {
  if (trend === null) return <span className="text-muted-foreground">–</span>
  const style = TREND_STYLES[trend]
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        style.className
      )}
    >
      {style.label}
    </span>
  )
}

function ShopsTable({ report }: { report: TrendsReport }) {
  const [showAll, setShowAll] = useState(false)
  const { currency } = report
  // Shops that only had refunds have nothing to trend
  const shops = report.shops.filter((s) => s.payments > 0)
  const visible = showAll ? shops : shops.slice(0, TOP_SHOPS)
  const showTrend = report.months.length >= 2

  if (shops.length === 0) return null

  return (
    <ReportCard
      title="Shops"
      description={
        showAll || shops.length <= TOP_SHOPS
          ? `${shops.length} shops`
          : `Top ${TOP_SHOPS} of ${shops.length} shops`
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={TH_CLASS}>Shop</TableHead>
            <TableHead className={cn(TH_CLASS, 'text-right')}>Payments</TableHead>
            <TableHead className={cn(TH_CLASS, 'text-right')}>Per payment</TableHead>
            <TableHead className={cn(TH_CLASS, 'text-right')}>Monthly average</TableHead>
            <TableHead className={cn(TH_CLASS, 'text-right')}>Total</TableHead>
            {showTrend && <TableHead className={TH_CLASS}>By month</TableHead>}
            {showTrend && <TableHead className={TH_CLASS}>Trend</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((shop) => (
            <TableRow key={shop.key}>
              <TableCell className="max-w-56 truncate font-medium">{shop.label}</TableCell>
              <TableCell className={cn(NUM_CLASS, 'text-muted-foreground')}>
                {shop.payments}
              </TableCell>
              <TableCell className={NUM_CLASS}>
                {shop.averagePerPayment === null
                  ? '–'
                  : formatCurrency(shop.averagePerPayment, currency)}
              </TableCell>
              <TableCell className={NUM_CLASS}>{formatCurrency(shop.average, currency)}</TableCell>
              <TableCell className={cn(NUM_CLASS, 'font-medium')}>
                {formatCurrency(shop.total, currency)}
              </TableCell>
              {showTrend && (
                <TableCell>
                  <Sparkline values={shop.months} />
                </TableCell>
              )}
              {showTrend && (
                <TableCell>
                  <TrendPill trend={shop.trend} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {shops.length > TOP_SHOPS && (
        <div className="mt-2 flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show top 15' : `Show all ${shops.length}`}
          </Button>
        </div>
      )}
    </ReportCard>
  )
}

function AccountsMatrix({ report }: { report: TrendsReport }) {
  const { months, currency } = report
  if (report.accounts.length === 0) return null

  return (
    <ReportCard
      title="Spending by account"
      description="Which card or bank account the spending went through"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={cn(TH_CLASS, STICKY_CELL)}>Account</TableHead>
            <MonthHeads months={months} />
            <TableHead className={cn(TH_CLASS, 'text-right')}>Monthly average</TableHead>
            <TableHead className={cn(TH_CLASS, 'text-right')}>Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.accounts.map((account) => (
            <TableRow key={account.key}>
              <TableCell className={cn('font-medium whitespace-nowrap', STICKY_CELL)}>
                {account.label}
                {account.last4 && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    ••{account.last4}
                  </span>
                )}
              </TableCell>
              {account.months.map((amount, i) => (
                <TableCell key={months[i]} className={NUM_CLASS}>
                  {amount === 0 ? (
                    <span className="text-muted-foreground">–</span>
                  ) : (
                    formatCurrency(amount, currency)
                  )}
                </TableCell>
              ))}
              <TableCell className={cn(NUM_CLASS, 'text-muted-foreground')}>
                {formatCurrency(account.average, currency)}
              </TableCell>
              <TableCell className={cn(NUM_CLASS, 'font-medium')}>
                {formatCurrency(account.total, currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className={cn('font-semibold', STICKY_CELL, 'bg-muted')}>Total</TableCell>
            {report.monthTotals.map((amount, i) => (
              <TableCell key={months[i]} className={cn(NUM_CLASS, 'font-semibold')}>
                {formatCurrency(amount, currency)}
              </TableCell>
            ))}
            <TableCell className={cn(NUM_CLASS, 'font-semibold')}>
              {formatCurrency(report.average, currency)}
            </TableCell>
            <TableCell className={cn(NUM_CLASS, 'font-semibold')}>
              {formatCurrency(report.total, currency)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </ReportCard>
  )
}
