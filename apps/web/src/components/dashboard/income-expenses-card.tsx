/**
 * Income vs Expenses chart card component
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MonthlyTrendsChart } from './monthly-trends-chart'
import type { MonthlyTrendData } from '@/lib/api'

interface IncomeExpensesCardProps {
  trendsData: { trends: MonthlyTrendData[]; currency: string } | undefined
  isLoading: boolean
  onMonthClick: (month: MonthlyTrendData) => void
}

export function IncomeExpensesCard({
  trendsData,
  isLoading,
  onMonthClick,
}: IncomeExpensesCardProps) {
  return (
    <Card className="mb-6 border-border-subtle hover:border-border-hover transition-colors">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Cash Flow & Savings Rate
        </CardTitle>
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
