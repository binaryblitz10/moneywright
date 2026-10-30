import { Link } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { formatBudgetAmount, monthRangeOf, monthShort } from '@/components/budgets/format'
import { CategoryIcon } from '@/components/ui/category-icon'
import { getCategoryColorClasses } from '@/lib/category-colors'
import { cn } from '@/lib/utils'
import type { BudgetRangeSummary } from '@/lib/api'

/** Categories listed under the month strip */
const VISIBLE_CATEGORIES = 4
/** Past this many months the strip drops its month labels to stay readable */
const LABELLED_MONTHS = 12

const STATUS_BAR = {
  ok: 'bg-positive',
  warning: 'bg-warning',
  over: 'bg-negative',
} as const

interface BudgetsPerformanceProps {
  summary: BudgetRangeSummary
  getCategoryColor: (code: string) => string
}

/** Several months of budgets: how many held, a bar per month and the categories that keep going over */
export function BudgetsPerformance({ summary, getCategoryColor }: BudgetsPerformanceProps) {
  const { currency, months, monthCount, monthsWithinBudget } = summary
  const money = (amount: number) => formatBudgetAmount(amount, currency)
  const repeatOffenders = summary.categories
    .filter((c) => c.monthsOver > 0)
    .slice(0, VISIBLE_CATEGORIES)

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="text-2xl font-semibold tracking-tight">
          <span className="tabular-nums">
            {monthsWithinBudget} of {monthCount}
          </span>{' '}
          {monthCount === 1 ? 'month' : 'months'} within budget
        </p>
        <p className="text-sm text-muted-foreground tabular-nums">
          {money(summary.totalSpent)} spent of {money(summary.totalAvailable)} budgeted
        </p>
      </div>

      <div>
        <ul className="flex h-20 items-stretch gap-1">
          {months.map((m) => (
            <li key={m.month} className="min-w-0 flex-1">
              <Link
                to="/transactions"
                search={{
                  category: m.entries.map((e) => e.category).join(','),
                  ...monthRangeOf(m.month),
                }}
                title={`${m.month}${m.inProgress ? ' (so far)' : ''}: ${money(m.totalSpent)} of ${money(m.totalAvailable)}`}
                aria-label={`${m.month}: ${money(m.totalSpent)} of ${money(m.totalAvailable)} budgeted`}
                className="flex h-full flex-col justify-end rounded-md bg-muted transition-colors hover:bg-muted/70 dark:bg-foreground/15 dark:hover:bg-foreground/20"
              >
                <span
                  className={cn(
                    'block min-h-1 rounded-md transition-[height] duration-700 ease-out',
                    STATUS_BAR[m.status]
                  )}
                  style={{ height: `${Math.min(100, m.percentUsed)}%` }}
                />
              </Link>
            </li>
          ))}
        </ul>
        {months.length <= LABELLED_MONTHS && (
          <ul className="mt-1.5 flex gap-1">
            {months.map((m) => (
              <li
                key={m.month}
                className="min-w-0 flex-1 truncate text-center text-[10px] text-muted-foreground"
              >
                {monthShort(m.month)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {repeatOffenders.length > 0 ? (
        <ul className="space-y-0.5">
          {repeatOffenders.map((c) => {
            const colors = getCategoryColorClasses(getCategoryColor(c.category))
            return (
              <li key={c.category}>
                <Link
                  to="/transactions"
                  search={{
                    category: c.category,
                    startDate: monthRangeOf(summary.startMonth).startDate,
                    endDate: monthRangeOf(summary.endMonth).endDate,
                  }}
                  className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-lg hover:bg-surface-elevated transition-colors"
                >
                  {/* Left: category name and how often it went over */}
                  <div className="min-w-0 flex-1 pr-4">
                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <CategoryIcon code={c.category} className={colors.text} />
                      <span className="truncate">{c.categoryLabel}</span>
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                      Over in {c.monthsOver} of {c.monthsTracked}{' '}
                      {c.monthsTracked === 1 ? 'month' : 'months'}
                    </p>
                  </div>

                  {/* Right: spent over the range and what was budgeted for it */}
                  <p className="text-sm font-semibold tabular-nums shrink-0 text-right min-w-20 text-negative">
                    {money(c.totalSpent)}
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      of {money(c.totalAvailable)}
                    </span>
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="h-4 w-4 text-positive" />
          Every category stayed within budget
        </p>
      )}
    </div>
  )
}
