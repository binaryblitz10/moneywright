/**
 * Spending by Category card component
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { InlineEmptyState } from '@/components/ui/empty-state'
import { PieChart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CategoryBreakdown } from './category-breakdown'
import { CategoryBreakdownDialog } from './category-breakdown-dialog'

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
}: SpendingByCategoryCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const breakdown = categoryStats?.categoryBreakdown
  const hasData = !isLoading && !!breakdown && breakdown.length > 0

  return (
    <>
      <Card
        className={cn(
          'border-border-subtle hover:border-border-hover transition-colors',
          hasData && 'cursor-pointer'
        )}
        onClick={hasData ? () => setDialogOpen(true) : undefined}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Spending by Category
            </CardTitle>
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              {/* Monthly Average Toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onShowMonthlyAverageChange(!showMonthlyAverage)}
                className={cn(
                  'h-7 text-xs',
                  showMonthlyAverage
                    ? 'text-primary hover:text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {showMonthlyAverage ? '/mo' : 'Total'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
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
            />
          ) : (
            <InlineEmptyState
              icon={PieChart}
              title="No spending data"
              description="Categories appear after importing transactions"
            />
          )}
        </CardContent>
      </Card>
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
        />
      )}
    </>
  )
}
