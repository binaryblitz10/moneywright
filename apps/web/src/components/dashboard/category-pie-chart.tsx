/**
 * Pie chart view of a category breakdown, coloured to match the list view.
 * The header, legend rows and footer mirror CategoryBreakdown row for row. The donut
 * fills whatever height the card has (set by the legend or by a taller card beside it)
 * without adding to it, so switching views never changes the card height.
 */

import { useState } from 'react'
import { Cell, Pie, PieChart as RechartsPieChart, ResponsiveContainer, Sector } from 'recharts'
import { InlineEmptyState } from '@/components/ui/empty-state'
import { PieChart } from 'lucide-react'
import { getCategoryFillColor } from '@/lib/category-colors'
import { cn } from '@/lib/utils'
import { formatCurrency } from './utils'
import { CategoryChange } from './category-change'
import type { CategoryComparison } from './category-comparison'
import { CategoryIcon } from '@/components/ui/category-icon'

interface CategoryPieChartProps {
  categoryBreakdown: { category: string; total: number; count: number }[]
  /** Overall total, as shown in the list view */
  total: number
  currency: string
  getCategoryLabel: (code: string) => string
  getCategoryColor: (code: string) => string
  showMonthlyAverage?: boolean
  totalMonths?: number
  totalLabel?: string
  averageLabel?: string
  /** Max categories to list beside the chart (default 6, matching the list view) */
  limit?: number
  /** Show "vs previous period" labels: null shows "–" (no full data), undefined hides them */
  comparison?: CategoryComparison | null
}

export function CategoryPieChart({
  categoryBreakdown,
  total,
  currency,
  getCategoryLabel,
  getCategoryColor,
  showMonthlyAverage = false,
  totalMonths = 1,
  totalLabel = 'Total Spent',
  averageLabel = 'Avg. Monthly',
  limit = 6,
  comparison,
}: CategoryPieChartProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  // Net refunds (negative totals) have no slice
  const slices = categoryBreakdown
    .map((cat) => ({
      category: cat.category,
      total: cat.total,
      name: getCategoryLabel(cat.category),
      value: showMonthlyAverage ? Math.round(cat.total / totalMonths) : cat.total,
      fill: getCategoryFillColor(getCategoryColor(cat.category)),
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)

  if (slices.length === 0) {
    return (
      <InlineEmptyState
        icon={PieChart}
        title="Nothing to chart"
        description="Only categories with a positive total appear in the pie chart"
      />
    )
  }

  const sliceTotal = slices.reduce((sum, s) => sum + s.value, 0)
  const legend = slices.slice(0, limit)
  const displayTotal = showMonthlyAverage ? Math.round(total / totalMonths) : total
  const suffix = showMonthlyAverage ? '/mo' : ''

  return (
    <div className="flex-1 flex flex-col">
      {/* Total header - same as the list view */}
      <div className="flex items-center justify-between pb-3 mb-1 border-b border-border-subtle">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          {showMonthlyAverage ? averageLabel : totalLabel}
        </span>
        <span className="flex items-baseline gap-2">
          {comparison !== undefined && (
            <CategoryChange
              current={total}
              previous={comparison?.previousTotal}
              periodLabel={comparison?.periodLabel}
              currency={currency}
            />
          )}
          <span className="text-base font-bold text-foreground tabular-nums">
            {formatCurrency(displayTotal, currency)}
          </span>
        </span>
      </div>

      <div className="flex-1 flex gap-6">
        {/* Legend: rows sized like the list view's rows */}
        <div className="flex-1 min-w-0 space-y-0.5">
          {legend.map((s) => {
            const isActive = activeCategory === s.category
            return (
              <div
                key={s.category}
                onMouseEnter={() => setActiveCategory(s.category)}
                onMouseLeave={() => setActiveCategory(null)}
                className="flex items-center justify-between gap-3 py-2.5 px-2 -mx-2 rounded-lg transition-colors"
                style={{
                  backgroundColor: isActive
                    ? `color-mix(in srgb, ${s.fill} 18%, transparent)`
                    : undefined,
                }}
              >
                <div className="min-w-0">
                  <p
                    className={cn(
                      'flex items-center gap-2 text-sm text-foreground',
                      isActive ? 'font-semibold' : 'font-medium'
                    )}
                  >
                    <span className="shrink-0" style={{ color: s.fill }}>
                      <CategoryIcon code={s.category} />
                    </span>
                    <span className="truncate">{s.name}</span>
                  </p>
                  <div className="flex items-center gap-1.5 mt-1 h-4">
                    <span
                      className="size-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: s.fill }}
                    />
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {Math.round((s.value / sliceTotal) * 100)}%
                    </span>
                  </div>
                </div>
                <p className="text-sm font-semibold text-foreground tabular-nums shrink-0 text-right">
                  {formatCurrency(s.value, currency)}
                  {suffix && (
                    <span className="text-[10px] text-muted-foreground font-normal">{suffix}</span>
                  )}
                  {comparison !== undefined && (
                    <CategoryChange
                      className="block"
                      current={s.total}
                      previous={comparison?.previousByCategory.get(s.category)}
                      periodLabel={comparison?.periodLabel}
                      currency={currency}
                    />
                  )}
                </p>
              </div>
            )
          })}
        </div>

        {/* Donut: absolutely filled so it takes the row's height instead of adding to it */}
        <div className="relative w-1/2 max-w-96 shrink-0">
          <div className="absolute inset-0">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="62%"
                  outerRadius="92%"
                  paddingAngle={2}
                  cornerRadius={4}
                  stroke="none"
                  isAnimationActive={false}
                  onMouseEnter={(_, index) => setActiveCategory(slices[index]?.category ?? null)}
                  onMouseLeave={() => setActiveCategory(null)}
                  shape={(props: unknown) => {
                    const sectorProps = props as React.ComponentProps<typeof Sector> & {
                      category: string
                    }
                    const isActive = activeCategory === sectorProps.category
                    return (
                      <Sector
                        {...sectorProps}
                        outerRadius={Number(sectorProps.outerRadius) + (isActive ? 5 : 0)}
                        fillOpacity={activeCategory && !isActive ? 0.4 : 0.9}
                      />
                    )
                  }}
                >
                  {slices.map((s) => (
                    <Cell key={s.category} fill={s.fill} />
                  ))}
                </Pie>
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {slices.length > legend.length && (
        <p className="text-[11px] text-muted-foreground text-center pt-3">
          +{slices.length - legend.length} more categories
        </p>
      )}
    </div>
  )
}
