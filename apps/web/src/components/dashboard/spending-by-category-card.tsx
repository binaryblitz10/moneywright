/**
 * Spending by Category card component
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { InlineEmptyState } from '@/components/ui/empty-state'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PieChart, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CategoryBreakdown } from './category-breakdown'

interface Category {
  code: string
  label: string
  color?: string
}

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
  excludedCategories: string[]
  onToggleExclusion: (categoryCode: string) => void
  onClearExclusions: () => void
  categories: Category[]
  getCategoryLabel: (code: string) => string
  getCategoryColor: (code: string) => string
}

export function SpendingByCategoryCard({
  categoryStats,
  isLoading,
  showMonthlyAverage,
  onShowMonthlyAverageChange,
  totalMonths,
  excludedCategories,
  onToggleExclusion,
  onClearExclusions,
  categories,
  getCategoryLabel,
  getCategoryColor,
}: SpendingByCategoryCardProps) {
  return (
    <Card className="border-border-subtle hover:border-border-hover transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Spending by Category
          </CardTitle>
          <div className="flex items-center gap-1">
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
            {/* Category Filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-7 text-xs text-muted-foreground hover:text-foreground',
                    excludedCategories.length > 0 && 'text-primary'
                  )}
                >
                  <SlidersHorizontal className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-3">
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-medium mb-1">Exclude Categories</h4>
                    <p className="text-xs text-muted-foreground">
                      Hide these categories from the chart
                    </p>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {categories.map((cat) => (
                      <label
                        key={cat.code}
                        className="flex items-center gap-2 text-sm cursor-pointer hover:text-foreground"
                      >
                        <Checkbox
                          checked={excludedCategories.includes(cat.code)}
                          onCheckedChange={() => onToggleExclusion(cat.code)}
                        />
                        <span
                          className={cn(
                            excludedCategories.includes(cat.code) &&
                              'line-through text-muted-foreground'
                          )}
                        >
                          {cat.label}
                        </span>
                      </label>
                    ))}
                  </div>
                  {excludedCategories.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full h-7 text-xs"
                      onClick={onClearExclusions}
                    >
                      Clear all
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
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
  )
}
