/**
 * Income vs Expenses chart card component
 */

import { SectionCard } from '@/components/ui/section-card'
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
    <SectionCard title="Cash Flow & Savings Rate" className="mb-6">
      <MonthlyTrendsChart
        data={trendsData?.trends || []}
        currency={trendsData?.currency || 'INR'}
        isLoading={isLoading}
        onMonthClick={onMonthClick}
      />
    </SectionCard>
  )
}
