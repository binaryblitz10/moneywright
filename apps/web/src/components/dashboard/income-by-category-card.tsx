/**
 * Income by Category card component
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { InlineEmptyState } from '@/components/ui/empty-state'
import { Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CategoryBreakdown } from './category-breakdown'

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
  return (
    <Card className="border-border-subtle hover:border-border-hover transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Income by Category
          </CardTitle>
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
        ) : incomeBreakdown && incomeBreakdown.length > 0 ? (
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
        ) : (
          <InlineEmptyState
            icon={Wallet}
            title="No income data"
            description="Income categories appear after importing transactions"
          />
        )}
      </CardContent>
    </Card>
  )
}
