/**
 * Income vs Expenses chart card component
 */

import { SectionCard } from '@/components/ui/section-card'
import { MonthlyTrendsChart } from './monthly-trends-chart'
import type { MonthlyTrendData } from '@/lib/api'

interface IncomeExpensesCardProps {
  /** Selected timeframe, shown under the title */
  periodLabel: string
  trendsData: { trends: MonthlyTrendData[]; currency: string } | undefined
  isLoading: boolean
  onMonthClick: (month: MonthlyTrendData) => void
  getCategoryLabel: (code: string) => string
}

export function IncomeExpensesCard({
  periodLabel,
  trendsData,
  isLoading,
  onMonthClick,
  getCategoryLabel,
}: IncomeExpensesCardProps) {
  return (
    <SectionCard title="Cash Flow & Savings Rate" description={periodLabel} className="mb-6">
      <MonthlyTrendsChart
        data={trendsData?.trends || []}
        currency={trendsData?.currency || 'INR'}
        isLoading={isLoading}
        onMonthClick={onMonthClick}
        getCategoryLabel={getCategoryLabel}
      />
    </SectionCard>
  )
}
