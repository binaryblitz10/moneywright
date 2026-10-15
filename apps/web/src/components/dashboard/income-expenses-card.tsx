/**
 * Income vs Expenses chart card component
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MonthlyTrendsChart } from './monthly-trends-chart'
import type { MonthlyTrendData } from '@/lib/api'

interface Category {
  code: string
  label: string
}

interface IncomeExpensesCardProps {
  trendsData: { trends: MonthlyTrendData[]; currency: string } | undefined
  isLoading: boolean
  excludedCategories: string[]
  onToggleExclusion: (categoryCode: string) => void
  onClearExclusions: () => void
  categories: Category[]
  onMonthClick: (month: MonthlyTrendData) => void
}

export function IncomeExpensesCard({
  trendsData,
  isLoading,
  excludedCategories,
  onToggleExclusion,
  onClearExclusions,
  categories,
  onMonthClick,
}: IncomeExpensesCardProps) {
  return (
    <Card className="mb-6 border-border-subtle hover:border-border-hover transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Income vs Expenses
          </CardTitle>
          <div className="flex items-center gap-1">
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
        <MonthlyTrendsChart
          data={trendsData?.trends || []}
          currency={trendsData?.currency || 'INR'}
          isLoading={isLoading}
          onMonthClick={onMonthClick}
        />
      </CardContent>
    </Card>
  )
}
