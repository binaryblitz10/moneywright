/**
 * "vs previous period" label for a category amount: the % change in spending against
 * the same number of whole months just before the selected period
 */

import { cn } from '@/lib/utils'
import { formatCurrency } from './utils'

interface CategoryChangeProps {
  current: number
  /** Previous period's total; undefined when there is nothing to compare */
  previous: number | undefined
  periodLabel: string | undefined
  currency: string
  className?: string
}

export function CategoryChange({
  current,
  previous,
  periodLabel,
  currency,
  className,
}: CategoryChangeProps) {
  if (previous === undefined || previous <= 0) {
    return (
      <span
        className={cn('text-[10px] text-muted-foreground', className)}
        title={
          periodLabel ? `No spending in ${periodLabel}` : 'No full data for the previous period'
        }
      >
        –
      </span>
    )
  }

  const pct = Math.round(((current - previous) / previous) * 100)
  return (
    <span
      className={cn(
        'text-[10px] font-medium tabular-nums',
        pct > 0 ? 'text-negative' : pct < 0 ? 'text-positive' : 'text-muted-foreground',
        className
      )}
      title={`${periodLabel}: ${formatCurrency(previous, currency)}`}
    >
      {pct === 0 ? '0%' : `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%`}
    </span>
  )
}
