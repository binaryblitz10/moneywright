import { Link } from '@tanstack/react-router'
import { BudgetProgressBar } from '@/components/budgets/budget-progress-bar'
import { formatBudgetAmount, getMonthPace, monthRangeOf } from '@/components/budgets/format'
import { CategoryIcon } from '@/components/ui/category-icon'
import { getCategoryColorClasses } from '@/lib/category-colors'
import { cn } from '@/lib/utils'
import type { BudgetMonth } from '@/lib/api'

/** Budgets shown before the rest are folded into "+N more" */
const VISIBLE_ROWS = 4

interface BudgetsMonthViewProps {
  month: BudgetMonth
  currency: string
  getCategoryLabel: (code: string) => string
  getCategoryColor: (code: string) => string
}

/** One month of budgets: the overall figure, then the fullest budgets with what is left */
export function BudgetsMonthView({
  month,
  currency,
  getCategoryLabel,
  getCategoryColor,
}: BudgetsMonthViewProps) {
  const money = (amount: number) => formatBudgetAmount(amount, currency)
  const pace = getMonthPace(month.month)
  const remaining = month.totalAvailable - month.totalSpent
  const entries = [...month.entries].sort((a, b) => b.percentUsed - a.percentUsed)
  const hidden = entries.length - VISIBLE_ROWS

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {money(month.totalSpent)}
          </p>
          <p className="text-sm text-muted-foreground tabular-nums">
            of {money(month.totalAvailable)}
          </p>
        </div>
        <BudgetProgressBar
          percentUsed={month.percentUsed}
          status={month.status}
          label="Total budget used"
          pacePercent={pace.isCurrent ? pace.percentElapsed : undefined}
        />
        <p
          className={cn(
            'text-xs tabular-nums',
            month.status === 'over' ? 'text-negative' : 'text-muted-foreground'
          )}
        >
          {month.status === 'over' ? `${money(-remaining)} over` : `${money(remaining)} left`}
          {pace.isCurrent && ` · ${pace.daysLeft} days left`}
        </p>
      </div>

      <ul className="space-y-0.5">
        {entries.slice(0, VISIBLE_ROWS).map((entry) => {
          const colors = getCategoryColorClasses(getCategoryColor(entry.category))
          const label = getCategoryLabel(entry.category)
          const over = entry.status === 'over'
          return (
            <li key={entry.category}>
              <Link
                to="/transactions"
                search={{ category: entry.category, ...monthRangeOf(month.month) }}
                className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-lg hover:bg-surface-elevated transition-colors"
              >
                {/* Left: category name and progress bar */}
                <div className="min-w-0 flex-1 pr-4">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <CategoryIcon code={entry.category} className={colors.text} />
                    <span className="truncate">{label}</span>
                  </p>
                  <BudgetProgressBar
                    percentUsed={entry.percentUsed}
                    status={entry.status}
                    label={`${label} budget used`}
                    className="mt-2 h-1"
                  />
                </div>

                {/* Right: spent so far and the budget */}
                <p
                  className={cn(
                    'text-sm font-semibold tabular-nums shrink-0 text-right min-w-20',
                    over ? 'text-negative' : 'text-foreground'
                  )}
                >
                  {money(entry.spent)}
                  <span className="block text-[10px] font-normal text-muted-foreground">
                    of {money(entry.available)}
                  </span>
                </p>
              </Link>
            </li>
          )
        })}
      </ul>

      {hidden > 0 && (
        <p className="text-xs text-muted-foreground">
          +{hidden} more {hidden === 1 ? 'budget' : 'budgets'}
        </p>
      )}
    </div>
  )
}
