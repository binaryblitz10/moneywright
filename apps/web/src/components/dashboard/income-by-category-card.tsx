/**
 * Income by Category card component
 */

import { useState } from 'react'
import { SectionCard } from '@/components/ui/section-card'
import { TotalAverageToggle } from './total-average-toggle'
import { Skeleton } from '@/components/ui/skeleton'
import { InlineEmptyState } from '@/components/ui/empty-state'
import { Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CategoryBreakdown } from './category-breakdown'
import { CategoryPieChart } from './category-pie-chart'
import { CategoryViewToggle, type CategoryView } from './category-view-toggle'
import { CategoryBreakdownDialog } from './category-breakdown-dialog'

interface IncomeByCategoryCardProps {
  incomeBreakdown: { category: string; total: number; count: number }[] | undefined
  totalIncome: number
  currency: string
  isLoading: boolean
  showMonthlyAverage: boolean
  onShowMonthlyAverageChange: (show: boolean) => void
  totalMonths: number
  getCategoryLabel: (code: string) => string
  getCategoryColor: (code: string) => string
  startDate?: string
  endDate?: string
}

export function IncomeByCategoryCard({
  incomeBreakdown,
  totalIncome,
  currency,
  isLoading,
  showMonthlyAverage,
  onShowMonthlyAverageChange,
  totalMonths,
  getCategoryLabel,
  getCategoryColor,
  startDate,
  endDate,
}: IncomeByCategoryCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [view, setView] = useState<CategoryView>('list')
  const hasData = !isLoading && !!incomeBreakdown && incomeBreakdown.length > 0

  return (
    <>
      <SectionCard
        title="Income by Category"
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
        ) : incomeBreakdown && incomeBreakdown.length > 0 ? (
          view === 'pie' ? (
            <CategoryPieChart
              categoryBreakdown={incomeBreakdown}
              total={totalIncome}
              currency={currency}
              getCategoryLabel={getCategoryLabel}
              getCategoryColor={getCategoryColor}
              showMonthlyAverage={showMonthlyAverage}
              totalMonths={totalMonths}
              totalLabel="Total Income"
              averageLabel="Avg. Monthly Income"
            />
          ) : (
            <CategoryBreakdown
              categoryBreakdown={incomeBreakdown}
              total={totalIncome}
              currency={currency}
              getCategoryLabel={getCategoryLabel}
              getCategoryColor={getCategoryColor}
              showMonthlyAverage={showMonthlyAverage}
              totalMonths={totalMonths}
              startDate={startDate}
              endDate={endDate}
              totalLabel="Total Income"
              averageLabel="Avg. Monthly Income"
              emptyTitle="No income data"
            />
          )
        ) : (
          <InlineEmptyState
            icon={Wallet}
            title="No income data"
            description="Income categories appear after importing transactions"
          />
        )}
      </SectionCard>
      {hasData && (
        <CategoryBreakdownDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Income by Category"
          categoryBreakdown={incomeBreakdown}
          total={totalIncome}
          currency={currency}
          getCategoryLabel={getCategoryLabel}
          getCategoryColor={getCategoryColor}
          showMonthlyAverage={showMonthlyAverage}
          totalMonths={totalMonths}
          startDate={startDate}
          endDate={endDate}
          totalLabel="Total Income"
          averageLabel="Avg. Monthly Income"
          emptyTitle="No income data"
        />
      )}
    </>
  )
}
