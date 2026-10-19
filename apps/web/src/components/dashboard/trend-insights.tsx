import { useMemo } from 'react'
import type { MonthlyTrendData } from '@/lib/api'
import { formatCompact } from './utils'
import { formatPercent } from './trend-format'

interface Insight {
  label: string
  value: string
  detail: string
}

function buildInsights(data: MonthlyTrendData[], currency: string): Insight[] {
  const totalIncome = data.reduce((sum, d) => sum + d.income, 0)
  const totalSurplus = data.reduce((sum, d) => sum + d.surplus, 0)
  const totalInvested = data.reduce((sum, d) => sum + d.invested, 0)
  const averageExpenses = data.reduce((sum, d) => sum + d.expenses, 0) / data.length
  const insights: Insight[] = []

  if (totalIncome > 0) {
    insights.push({
      label: 'Net surplus',
      value: formatCompact(totalSurplus, currency),
      detail: `${Math.round((totalSurplus / totalIncome) * 100)}% of income`,
    })
  }

  const highest = data.reduce((max, d) => (d.expenses > max.expenses ? d : max), data[0]!)
  if (highest.expenses > 0 && averageExpenses > 0) {
    insights.push({
      label: 'Highest spend',
      value: `${highest.monthLabel} · ${formatCompact(highest.expenses, currency)}`,
      detail: `${(highest.expenses / averageExpenses).toFixed(1)}× your monthly average`,
    })
  }

  // Months the range doesn't fully cover would skew "best"
  const best = data
    .filter((d) => !d.isPartial && d.savingsRate !== null)
    .reduce<MonthlyTrendData | null>(
      (top, d) => (!top || (d.savingsRate ?? 0) > (top.savingsRate ?? 0) ? d : top),
      null
    )
  if (best && (best.savingsRate ?? 0) > 0) {
    insights.push({
      label: 'Best month',
      value: `${best.monthLabel} · ${formatPercent(best.savingsRate)}`,
      detail: `Saved ${formatCompact(best.surplus, currency)} of ${formatCompact(best.income, currency)}`,
    })
  }

  if (totalInvested > 0 && totalSurplus > 0) {
    insights.push({
      label: 'Investing',
      value: `${(totalInvested / totalSurplus).toFixed(1)}× surplus`,
      detail: `${formatCompact(totalInvested, currency)} invested vs ${formatCompact(totalSurplus, currency)} saved`,
    })
  }

  return insights
}

interface TrendInsightsProps {
  data: MonthlyTrendData[]
  currency: string
}

export function TrendInsights({ data, currency }: TrendInsightsProps) {
  const insights = useMemo(
    () => (data.length >= 2 ? buildInsights(data, currency) : []),
    [data, currency]
  )
  if (insights.length === 0) return null

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      {insights.map((insight) => (
        <div key={insight.label} className="rounded-xl bg-surface-hover/60 px-3.5 py-3 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {insight.label}
          </p>
          <p className="mt-0.5 text-base font-bold text-foreground tabular-nums truncate">
            {insight.value}
          </p>
          <p className="text-xs text-muted-foreground truncate">{insight.detail}</p>
        </div>
      ))}
    </div>
  )
}
