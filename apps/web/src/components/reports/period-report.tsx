/**
 * Period report tab: totals, categories, shops and accounts for complete months
 * against the same number of months just before
 */

import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  CreditCard,
  Info,
  PiggyBank,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { StatCard, StatCardGrid } from '@/components/ui/stat-card'
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
import { getCategoryColorClasses } from '@/lib/category-colors'
import { cn } from '@/lib/utils'
import type {
  PeriodReport,
  ReportAccountFlow,
  ReportComparedRow,
  ReportSavingsBreakdown,
} from '@/lib/api'
import { ChangeAmount, ChangeLine, ChangePct, type GoodWhen } from './change-indicator'
import { NUM_CLASS, ReportCard, TH_CLASS } from './report-card'
import { formatRange } from './report-utils'

const TOP_SHOPS = 15

interface PeriodReportViewProps {
  report: PeriodReport
  getCategoryColor: (code: string) => string
}

export function PeriodReportView({ report, getCategoryColor }: PeriodReportViewProps) {
  const { period, totals, currency } = report
  const comparisonLabel = period.comparison ? formatRange(period.comparison) : null
  const hasData =
    totals.current.income > 0 ||
    totals.current.expenses > 0 ||
    totals.current.invested > 0 ||
    report.expenseCategories.length > 0

  if (!hasData) {
    return (
      <InlineEmptyState
        icon={Info}
        title="No transactions in this period"
        description="Pick another period, or upload statements that cover it."
      />
    )
  }

  const statCard = (
    label: string,
    key: 'income' | 'expenses' | 'invested' | 'surplus',
    icon: LucideIcon,
    goodWhen: GoodWhen
  ) => (
    <StatCard
      label={label}
      formatValue={formatCurrency}
      value={totals.current[key]}
      currency={currency}
      icon={icon}
      subtitle={
        <ChangeLine
          comparisonLabel={comparisonLabel}
          delta={totals.changes?.[key].delta ?? null}
          deltaPct={totals.changes?.[key].deltaPct ?? null}
          goodWhen={goodWhen}
        />
      }
    />
  )

  const rate = totals.current.savingsRate
  // Whole percentage points, so the arrow and the number always agree
  const ratePoints =
    totals.savingsRateDelta === null ? null : Math.round(totals.savingsRateDelta * 100)

  return (
    <div className="space-y-6">
      {comparisonLabel === null && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Info className="h-4 w-4 shrink-0" />
          No earlier data to compare. Changes appear once an earlier period has data from every
          account.
        </p>
      )}

      <StatCardGrid className="lg:grid-cols-2 xl:grid-cols-5">
        {statCard('Income', 'income', Wallet, 'up')}
        {statCard('Expenses', 'expenses', CreditCard, 'down')}
        <StatCard
          label="Savings rate"
          value={rate === null ? undefined : rate * 100}
          formatValue={(value) => `${Math.round(value)}%`}
          icon={PiggyBank}
          subtitle={
            rate === null ? (
              'No income in this period'
            ) : (
              <ChangeLine
                comparisonLabel={comparisonLabel}
                delta={ratePoints}
                deltaPct={null}
                goodWhen="up"
                text={<SavingsRateChange points={ratePoints} />}
              />
            )
          }
        />
        {statCard('Invested', 'invested', TrendingUp, 'up')}
        {statCard('Surplus', 'surplus', PiggyBank, 'up')}
      </StatCardGrid>

      <SavingsBreakdownCard savings={report.savings} currency={currency} />

      <CategoryTable
        title="Spending by category"
        rows={report.expenseCategories}
        total={{ current: totals.current.expenses, previous: totals.previous?.expenses ?? null }}
        goodWhen="down"
        report={report}
        getCategoryColor={getCategoryColor}
      />

      {report.incomeCategories.length > 0 && (
        <CategoryTable
          title="Income"
          rows={report.incomeCategories}
          total={{ current: totals.current.income, previous: totals.previous?.income ?? null }}
          goodWhen="up"
          report={report}
          getCategoryColor={getCategoryColor}
        />
      )}

      <ShopsTable report={report} />

      <AccountsTable report={report} />

      <WarningsCard warnings={report.warnings} />
    </div>
  )
}

/** "▲ 5 pts" for the change in savings rate */
function SavingsRateChange({ points }: { points: number | null }) {
  if (points === null) return <span>No rate before</span>
  return (
    <span
      className={cn(
        'font-medium tabular-nums',
        points > 0 ? 'text-positive' : points < 0 ? 'text-negative' : 'text-muted-foreground'
      )}
    >
      {points > 0 ? '▲ ' : points < 0 ? '▼ ' : ''}
      {Math.abs(points)} pts
    </span>
  )
}

function Row({
  label,
  hint,
  value,
  strong,
}: {
  label: string
  hint?: string
  value: ReactNode
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-border-subtle last:border-0">
      <div className="min-w-0">
        <p className={cn('text-sm', strong ? 'font-semibold text-foreground' : 'text-foreground')}>
          {label}
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <p className={cn('text-sm tabular-nums shrink-0', strong && 'font-semibold')}>{value}</p>
    </div>
  )
}

function SavingsBreakdownCard({
  savings,
  currency,
}: {
  savings: ReportSavingsBreakdown
  currency: string
}) {
  const signed = (amount: number | null) => {
    if (amount === null) return '–'
    const rounded = Math.round(amount)
    return `${rounded < 0 ? '-' : ''}${formatCurrency(Math.abs(rounded), currency)}`
  }

  return (
    <ReportCard
      title="Where your savings went"
      description="What was left after expenses, and where it ended up"
    >
      <div className="px-2 sm:px-2">
        <Row label="Surplus" hint="Income minus expenses" value={signed(savings.surplus)} strong />
        <Row label="Invested" hint="Put into investments" value={signed(savings.invested)} />
        <Row
          label="Added to bank accounts"
          hint="Change in bank balances"
          value={signed(savings.bankChange)}
        />
        <Row
          label="Card dues paid down"
          hint="Negative when card balances grew"
          value={signed(savings.cardDuesReduced)}
        />
        <Row
          label="Not explained"
          hint="What the balances don't account for, such as cash or missing transactions"
          value={signed(savings.unexplained)}
        />
      </div>
      {savings.status === 'insufficient' && (
        <p className="mt-3 px-2 text-xs text-muted-foreground">
          {savings.missingAccounts.length > 0
            ? `Balances are missing for ${savings.missingAccounts.map((a) => a.accountName).join(', ')}. Upload statements covering the start and end of this period to see the rest.`
            : 'There are no bank or card balances for this period.'}
        </p>
      )}
    </ReportCard>
  )
}

function PeriodHead({ report, which }: { report: PeriodReport; which: 'current' | 'previous' }) {
  const range = which === 'current' ? report.period : report.period.comparison
  return (
    <TableHead className={cn(TH_CLASS, 'text-right')}>
      <span className="block">{which === 'current' ? 'This period' : 'Previous'}</span>
      {range && (
        <span className="block text-[10px] font-normal normal-case tracking-normal">
          {formatRange(range)}
        </span>
      )}
    </TableHead>
  )
}

function CategoryTable({
  title,
  rows,
  total,
  goodWhen,
  report,
  getCategoryColor,
}: {
  title: string
  rows: ReportComparedRow[]
  total: { current: number; previous: number | null }
  goodWhen: GoodWhen
  report: PeriodReport
  getCategoryColor: (code: string) => string
}) {
  const { currency, period } = report
  const compared = period.comparison !== null
  const totalDelta = total.previous === null ? null : total.current - total.previous
  const totalPct =
    total.previous !== null && total.previous > 0 && totalDelta !== null
      ? totalDelta / total.previous
      : null

  return (
    <ReportCard title={title} description={`${rows.length} categories`}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={TH_CLASS}>Category</TableHead>
            <PeriodHead report={report} which="current" />
            {compared && <PeriodHead report={report} which="previous" />}
            {compared && <TableHead className={cn(TH_CLASS, 'text-right')}>Change</TableHead>}
            {compared && <TableHead className={cn(TH_CLASS, 'text-right')}>%</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="font-medium">
                <Link
                  to="/transactions"
                  search={{
                    category: row.key,
                    startDate: period.startDate,
                    endDate: period.endDate,
                  }}
                  className="flex items-center gap-2 hover:underline"
                >
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full shrink-0',
                      getCategoryColorClasses(getCategoryColor(row.key)).dot
                    )}
                  />
                  {row.label}
                </Link>
              </TableCell>
              <TableCell className={NUM_CLASS}>{formatCurrency(row.current, currency)}</TableCell>
              {compared && (
                <TableCell className={cn(NUM_CLASS, 'text-muted-foreground')}>
                  {formatCurrency(row.previous ?? 0, currency)}
                </TableCell>
              )}
              {compared && (
                <TableCell className={NUM_CLASS}>
                  <ChangeAmount delta={row.delta} goodWhen={goodWhen} currency={currency} />
                </TableCell>
              )}
              {compared && (
                <TableCell className={NUM_CLASS}>
                  <ChangePct delta={row.delta} deltaPct={row.deltaPct} goodWhen={goodWhen} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold">Total</TableCell>
            <TableCell className={cn(NUM_CLASS, 'font-semibold')}>
              {formatCurrency(total.current, currency)}
            </TableCell>
            {compared && (
              <TableCell className={cn(NUM_CLASS, 'text-muted-foreground')}>
                {formatCurrency(total.previous ?? 0, currency)}
              </TableCell>
            )}
            {compared && (
              <TableCell className={NUM_CLASS}>
                <ChangeAmount delta={totalDelta} goodWhen={goodWhen} currency={currency} />
              </TableCell>
            )}
            {compared && (
              <TableCell className={NUM_CLASS}>
                <ChangePct delta={totalDelta} deltaPct={totalPct} goodWhen={goodWhen} />
              </TableCell>
            )}
          </TableRow>
        </TableFooter>
      </Table>
    </ReportCard>
  )
}

function ShopsTable({ report }: { report: PeriodReport }) {
  const [showAll, setShowAll] = useState(false)
  const { currency, period } = report
  const compared = period.comparison !== null
  // Shops with no spending now only matter for the comparison, so they come after the rest
  const shops = report.shops.filter((s) => s.current !== 0)
  const visible = showAll ? shops : shops.slice(0, TOP_SHOPS)

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
            <PeriodHead report={report} which="current" />
            {compared && <PeriodHead report={report} which="previous" />}
            {compared && <TableHead className={cn(TH_CLASS, 'text-right')}>Change</TableHead>}
            {compared && <TableHead className={cn(TH_CLASS, 'text-right')}>%</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="max-w-56 truncate font-medium">{row.label}</TableCell>
              <TableCell className={cn(NUM_CLASS, 'text-muted-foreground')}>{row.count}</TableCell>
              <TableCell className={NUM_CLASS}>{formatCurrency(row.current, currency)}</TableCell>
              {compared && (
                <TableCell className={cn(NUM_CLASS, 'text-muted-foreground')}>
                  {formatCurrency(row.previous ?? 0, currency)}
                </TableCell>
              )}
              {compared && (
                <TableCell className={NUM_CLASS}>
                  <ChangeAmount delta={row.delta} goodWhen="down" currency={currency} />
                </TableCell>
              )}
              {compared && (
                <TableCell className={NUM_CLASS}>
                  <ChangePct delta={row.delta} deltaPct={row.deltaPct} goodWhen="down" />
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

/** A current value with the previous one beneath it */
function FlowCell({
  current,
  previous,
  currency,
}: {
  current: number
  previous: number | null
  currency: string
}) {
  return (
    <TableCell className={NUM_CLASS}>
      <span className="block">{formatCurrency(current, currency)}</span>
      {previous !== null && (
        <span className="block text-[10px] text-muted-foreground">
          before {formatCurrency(previous, currency)}
        </span>
      )}
    </TableCell>
  )
}

function AccountsTable({ report }: { report: PeriodReport }) {
  const { currency } = report
  if (report.accounts.length === 0) return null

  const prev = (account: ReportAccountFlow | null, key: keyof ReportAccountFlow) =>
    account ? account[key] : null

  return (
    <ReportCard
      title="By account"
      description="Money in, money out and invested through each account"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={TH_CLASS}>Account</TableHead>
            <TableHead className={cn(TH_CLASS, 'text-right')}>Income</TableHead>
            <TableHead className={cn(TH_CLASS, 'text-right')}>Expenses</TableHead>
            <TableHead className={cn(TH_CLASS, 'text-right')}>Invested</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.accounts.map((account) => (
            <TableRow key={account.id}>
              <TableCell className="font-medium">
                <span className="block max-w-56 truncate">
                  {account.name}
                  {account.last4 && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      ••{account.last4}
                    </span>
                  )}
                </span>
                <span className="block text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
                  {account.type === 'card'
                    ? 'Credit card'
                    : account.type === 'bank'
                      ? 'Bank'
                      : 'Other'}
                </span>
              </TableCell>
              <FlowCell
                current={account.current.income}
                previous={prev(account.previous, 'income')}
                currency={currency}
              />
              <FlowCell
                current={account.current.expenses}
                previous={prev(account.previous, 'expenses')}
                currency={currency}
              />
              <FlowCell
                current={account.current.invested}
                previous={prev(account.previous, 'invested')}
                currency={currency}
              />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ReportCard>
  )
}

function WarningsCard({ warnings }: { warnings: PeriodReport['warnings'] }) {
  if (warnings.count === 0) return null
  const hidden = warnings.count - warnings.items.length

  return (
    <Card className="gap-3 py-5 border-amber-500/30">
      <CardContent className="px-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Check your data
          </h3>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/statements">Statements</Link>
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {warnings.count} {warnings.count === 1 ? 'thing' : 'things'} that may make this period's
          numbers off
        </p>
        <ul className="mt-3 space-y-2">
          {warnings.items.map((item, index) => (
            <li key={index} className="text-sm">
              <span className="font-medium">{item.accountName}</span>
              <span className="text-muted-foreground"> · {item.message}</span>
            </li>
          ))}
        </ul>
        {hidden > 0 && <p className="mt-2 text-xs text-muted-foreground">and {hidden} more</p>}
      </CardContent>
    </Card>
  )
}
