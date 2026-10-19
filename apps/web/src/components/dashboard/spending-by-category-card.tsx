/**
 * Spending by Category card component
 */

import { useState } from 'react'
import { SectionCard } from '@/components/ui/section-card'
import { TotalAverageToggle } from './total-average-toggle'
import { Skeleton } from '@/components/ui/skeleton'
import { InlineEmptyState } from '@/components/ui/empty-state'
import { PieChart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CategoryBreakdown } from './category-breakdown'
import { CategoryPieChart } from './category-pie-chart'
import { CategoryViewToggle, type CategoryView } from './category-view-toggle'
import { CategoryBreakdownDialog } from './category-breakdown-dialog'
import { toCategoryComparison, type PreviousPeriodSpending } from './category-comparison'

interface CategoryStats {
  categoryBreakdown: { category: string; total: number; count: number }[]
  totalDebits: number
  currency: string
}

interface SpendingByCategoryCardProps {
  categoryStats: CategoryStats | undefined
  isLoading: boolean
  showMonthlyAverage: boolean
  onShowMonthlyAverageChange: (show: boolean) => void
  totalMonths: number
  getCategoryLabel: (code: string) => string
  getCategoryColor: (code: string) => string
  startDate?: string
  endDate?: string
  /** Spending in the previous period of the same length; null when there is no full data */
  previousPeriod: PreviousPeriodSpending | null | undefined
}

export function SpendingByCategoryCard({
  categoryStats,
  isLoading,
  showMonthlyAverage,
  onShowMonthlyAverageChange,
  totalMonths,
  getCategoryLabel,
  getCategoryColor,
  startDate,
  endDate,
  previousPeriod,
}: SpendingByCategoryCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  // Undefined until the summary loads, so labels never flash "–" first
  const comparison = previousPeriod === undefined ? undefined : toCategoryComparison(previousPeriod)
  const [view, setView] = useState<CategoryView>('list')
  const breakdown = categoryStats?.categoryBreakdown
  const hasData = !isLoading && !!breakdown && breakdown.length > 0

  return (
    <>
      <SectionCard
        title="Spending by Category"
        className={cn(hasData && 'cursor-pointer')}
        contentClassName="flex-1 flex flex-col"
        onClick={hasData ? () => setDialogOpen(true) : undefined}
        action={
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <CategoryViewToggle view={view} onViewChange={setView} />
            <TotalAverageToggle
              showMonthlyAverage={showMonthlyAverage}
              onChange={onShowMonthlyAverageChange}
            />
          </div>
        }
      >
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3.5 w-16" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        ) : categoryStats?.categoryBreakdown && categoryStats.categoryBreakdown.length > 0 ? (
          view === 'pie' ? (
            <CategoryPieChart
              categoryBreakdown={categoryStats.categoryBreakdown}
              total={categoryStats.totalDebits}
              currency={categoryStats.currency}
              getCategoryLabel={getCategoryLabel}
              getCategoryColor={getCategoryColor}
              showMonthlyAverage={showMonthlyAverage}
              totalMonths={totalMonths}
              comparison={comparison}
            />
          ) : (
            <CategoryBreakdown
              categoryBreakdown={categoryStats.categoryBreakdown}
              total={categoryStats.totalDebits}
              currency={categoryStats.currency}
              getCategoryLabel={getCategoryLabel}
              getCategoryColor={getCategoryColor}
              showMonthlyAverage={showMonthlyAverage}
              totalMonths={totalMonths}
              startDate={startDate}
              endDate={endDate}
              comparison={comparison}
            />
          )
        ) : (
          <InlineEmptyState
            icon={PieChart}
            title="No spending data"
            description="Categories appear after importing transactions"
          />
        )}
      </SectionCard>
      {hasData && categoryStats && (
        <CategoryBreakdownDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Spending by Category"
          categoryBreakdown={categoryStats.categoryBreakdown}
          total={categoryStats.totalDebits}
          currency={categoryStats.currency}
          getCategoryLabel={getCategoryLabel}
          getCategoryColor={getCategoryColor}
          showMonthlyAverage={showMonthlyAverage}
          totalMonths={totalMonths}
          startDate={startDate}
          endDate={endDate}
          comparison={comparison}
        />
      )}
    </>
  )
}
