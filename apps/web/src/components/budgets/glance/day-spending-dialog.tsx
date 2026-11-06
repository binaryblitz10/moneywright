import { useCallback } from 'react'
import { CategoryBreakdownDialog } from '@/components/dashboard/category-breakdown-dialog'
import { useAuth, useCategories } from '@/hooks'
import type { GlanceStats } from './glance-stats'

interface DaySpendingDialogProps {
  stats: GlanceStats
  month: string
  /** Day of the month to show; kept while closing so the content doesn't empty mid-animation */
  day: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** What one day's spending went on, in the same dialog as the dashboard's Spending by Category */
export function DaySpendingDialog({
  stats,
  month,
  day,
  open,
  onOpenChange,
}: DaySpendingDialogProps) {
  const { isAuthenticated } = useAuth()
  const { data } = useCategories(isAuthenticated)
  const categories = data?.categories

  const getCategoryLabel = useCallback(
    (code: string) =>
      categories?.find((c) => c.code === code)?.label ||
      stats.dailyCategories.flat().find((c) => c.category === code)?.categoryLabel ||
      code.replace(/_/g, ' '),
    [categories, stats.dailyCategories]
  )
  const getCategoryColor = useCallback(
    (code: string) => categories?.find((c) => c.code === code)?.color || 'zinc',
    [categories]
  )

  const [year, monthNum] = month.split('-').map(Number)
  const date = new Date(year!, monthNum! - 1, day)
  const iso = `${month}-${String(day).padStart(2, '0')}`

  return (
    <CategoryBreakdownDialog
      open={open}
      onOpenChange={onOpenChange}
      title={date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
      categoryBreakdown={(stats.dailyCategories[day - 1] ?? []).map(
        ({ category, amount, count }) => ({ category, total: amount, count })
      )}
      total={stats.daily[day - 1] ?? 0}
      currency={stats.currency}
      getCategoryLabel={getCategoryLabel}
      getCategoryColor={getCategoryColor}
      showMonthlyAverage={false}
      totalMonths={1}
      startDate={iso}
      endDate={iso}
      emptyTitle="No spending on this day"
    />
  )
}
