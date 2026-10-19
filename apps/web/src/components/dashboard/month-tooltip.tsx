import type { ReactNode } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import type { MonthlyTrendData } from '@/lib/api'
import { cn } from '@/lib/utils'
import { describeMonth, formatFullCurrency, formatPercent } from './trend-format'

function Row({ label, value, dot }: { label: ReactNode; value: ReactNode; dot?: string }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {dot && <div className="h-2.5 w-2.5 rounded-full" style={{ background: dot }} />}
        {label}
      </div>
      <span className="text-sm font-semibold text-foreground tabular-nums">{value}</span>
    </div>
  )
}

interface MonthTooltipProps {
  month: MonthlyTrendData
  /** The month before this one in the chart, for the expenses comparison */
  previous: MonthlyTrendData | undefined
  averageExpenses: number
  currency: string
  getCategoryLabel: (code: string) => string
  className?: string
}

export function MonthTooltip({
  month,
  previous,
  averageExpenses,
  currency,
  getCategoryLabel,
  className,
}: MonthTooltipProps) {
  const { income, expenses, invested, surplus, savingsRate, topExpenseCategory } = month
  // A month cut short by the range isn't comparable to a full one
  const comparable = !month.isPartial
  const expenseChange =
    comparable && previous && !previous.isPartial && previous.expenses > 0
      ? Math.round(((expenses - previous.expenses) / previous.expenses) * 100)
      : null
  const averageMultiple = comparable && averageExpenses > 0 ? expenses / averageExpenses : null

  return (
    <div
      className={cn(
        'w-60 rounded-xl border border-border-subtle bg-surface-elevated/95 backdrop-blur-xl p-4 shadow-2xl shadow-black/20',
        className
      )}
    >
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        {describeMonth(month)}
      </p>
      <div className="space-y-2">
        <Row dot="rgb(16, 185, 129)" label="Income" value={formatFullCurrency(income, currency)} />
        <Row
          dot="rgb(244, 63, 94)"
          label="Expenses"
          value={formatFullCurrency(expenses, currency)}
        />
        <Row dot="var(--chart-4)" label="Invested" value={formatFullCurrency(invested, currency)} />
        <div className="h-px bg-border-subtle my-1" />
        <Row
          label={
            <>
              {surplus >= 0 ? (
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
              )}
              Net surplus
            </>
          }
          value={`${surplus >= 0 ? '+' : '−'}${formatFullCurrency(Math.abs(surplus), currency)}`}
        />
        <Row label="Savings rate" value={formatPercent(savingsRate)} />
      </div>
      {(expenseChange !== null || averageMultiple !== null || topExpenseCategory) && (
        <div className="mt-3 pt-3 border-t border-border-subtle space-y-1 text-xs text-muted-foreground">
          {expenseChange !== null && previous && (
            <p>
              vs {previous.monthLabel}: expenses{' '}
              <span
                className={cn(
                  'font-semibold',
                  expenseChange > 0 ? 'text-rose-500' : 'text-emerald-500'
                )}
              >
                {expenseChange > 0 ? '▲' : expenseChange < 0 ? '▼' : '='} {Math.abs(expenseChange)}%
              </span>
            </p>
          )}
          {averageMultiple !== null && <p>{averageMultiple.toFixed(1)}× average monthly spend</p>}
          {topExpenseCategory && (
            <p>
              Biggest: {getCategoryLabel(topExpenseCategory.category)}{' '}
              {formatFullCurrency(topExpenseCategory.total, currency)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
