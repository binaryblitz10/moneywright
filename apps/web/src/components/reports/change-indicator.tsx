/**
 * "vs previous" change labels. Green and red say good or bad: for spending, lower is good.
 */

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/components/dashboard/utils'

export type GoodWhen = 'up' | 'down'

/** Text colour for a change: positive when it moved the good way, negative when the bad way */
function toneClass(delta: number, goodWhen: GoodWhen): string {
  if (delta === 0) return 'text-muted-foreground'
  return delta > 0 === (goodWhen === 'up') ? 'text-positive' : 'text-negative'
}

interface ChangeProps {
  delta: number | null
  deltaPct: number | null
  goodWhen: GoodWhen
  className?: string
}

/** "▲ 12%", "New" when there was nothing before, or "–" when there is no comparison */
export function ChangePct({ delta, deltaPct, goodWhen, className }: ChangeProps) {
  if (delta === null) {
    return <span className={cn('text-muted-foreground', className)}>–</span>
  }
  if (deltaPct === null) {
    return delta === 0 ? (
      <span className={cn('text-muted-foreground', className)}>–</span>
    ) : (
      <span
        className={cn(
          'rounded-full bg-surface-elevated border border-border-subtle px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground',
          className
        )}
      >
        New
      </span>
    )
  }
  const pct = Math.round(deltaPct * 100)
  return (
    <span className={cn('font-medium tabular-nums', toneClass(pct, goodWhen), className)}>
      {pct === 0 ? '0%' : `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%`}
    </span>
  )
}

interface ChangeAmountProps {
  delta: number | null
  goodWhen: GoodWhen
  currency: string
  className?: string
}

/** "+₹1,200" / "-₹800" */
export function ChangeAmount({ delta, goodWhen, currency, className }: ChangeAmountProps) {
  if (delta === null) {
    return <span className={cn('text-muted-foreground', className)}>–</span>
  }
  const rounded = Math.round(delta)
  return (
    <span className={cn('tabular-nums', toneClass(rounded, goodWhen), className)}>
      {rounded > 0 ? '+' : rounded < 0 ? '-' : ''}
      {formatCurrency(Math.abs(rounded), currency)}
    </span>
  )
}

interface ChangeLineProps extends ChangeProps {
  /** Comparison period label, e.g. "August 2026"; null when there is nothing to compare */
  comparisonLabel: string | null
  /** Replaces the percentage, e.g. "+5 pts" */
  text?: ReactNode
}

/** Stat card subtitle: "▲ 12% vs August 2026" or "No earlier data to compare" */
export function ChangeLine({ comparisonLabel, text, ...change }: ChangeLineProps) {
  if (comparisonLabel === null) return <span>No earlier data to compare</span>
  return (
    <span className="flex flex-wrap items-center gap-x-1.5">
      {text ?? <ChangePct {...change} />}
      <span>vs {comparisonLabel}</span>
    </span>
  )
}
