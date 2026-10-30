import { Link } from '@tanstack/react-router'
import { ChevronRight, Target } from 'lucide-react'
import { monthTitle } from '@/components/budgets/format'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionCard } from '@/components/ui/section-card'
import { Skeleton } from '@/components/ui/skeleton'
import { BudgetsMonthView } from './budgets-month-view'
import { BudgetsPerformance } from './budgets-performance'
import type { BudgetRangeSummary } from '@/lib/api'

interface BudgetsCardProps {
  summary: BudgetRangeSummary | undefined
  isLoading: boolean
  /** Label of the dashboard timeframe, e.g. "Last 6 months" */
  periodLabel: string
  getCategoryLabel: (code: string) => string
  getCategoryColor: (code: string) => string
  className?: string
}

/**
 * Budgets for the dashboard timeframe. One month shows that month's budgets;
 * several months show how often they held, month by month.
 */
export function BudgetsCard({
  summary,
  isLoading,
  periodLabel,
  getCategoryLabel,
  getCategoryColor,
  className,
}: BudgetsCardProps) {
  const [onlyMonth] = summary?.months ?? []
  const singleMonth = summary?.months.length === 1 ? onlyMonth : undefined

  return (
    <SectionCard
      title="Budgets"
      description={singleMonth ? monthTitle(singleMonth.month) : periodLabel}
      className={className}
      contentClassName="flex flex-1 flex-col"
      action={
        summary && summary.budgetCount > 0 ? (
          <Link to="/budgets">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              View all
              <ChevronRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        ) : undefined
      }
    >
      {isLoading || !summary ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : summary.budgetCount === 0 ? (
        <EmptyState
          icon={Target}
          title="No budgets yet"
          description="Set a monthly limit for a category like Food or Shopping and see how you keep to it."
          action={{ label: 'Add a budget', href: '/budgets' }}
          size="sm"
          glow
          className="my-auto"
        />
      ) : singleMonth ? (
        <BudgetsMonthView
          month={singleMonth}
          currency={summary.currency}
          getCategoryLabel={getCategoryLabel}
          getCategoryColor={getCategoryColor}
        />
      ) : summary.months.length === 0 ? (
        <p className="my-auto py-6 text-center text-sm text-muted-foreground">
          Nothing to show for this period yet.
        </p>
      ) : (
        <BudgetsPerformance summary={summary} getCategoryColor={getCategoryColor} />
      )}
    </SectionCard>
  )
}
