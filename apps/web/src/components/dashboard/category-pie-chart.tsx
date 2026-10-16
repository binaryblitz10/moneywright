/**
 * Pie chart view of a category breakdown, coloured to match the list view
 */

import { useState } from 'react'
import { Cell, Pie, PieChart as RechartsPieChart, ResponsiveContainer, Sector } from 'recharts'
import { InlineEmptyState } from '@/components/ui/empty-state'
import { PieChart } from 'lucide-react'
import { getCategoryFillColor } from '@/lib/category-colors'
import { cn } from '@/lib/utils'
import { formatCurrency } from './utils'

interface CategoryPieChartProps {
  categoryBreakdown: { category: string; total: number; count: number }[]
  /** Overall total, as shown in the list view */
  total: number
  currency: string
  getCategoryLabel: (code: string) => string
  getCategoryColor: (code: string) => string
  showMonthlyAverage?: boolean
  totalMonths?: number
  /** Max categories to list beside the chart (default 6) */
  limit?: number
}

export function CategoryPieChart({
  categoryBreakdown,
  total,
  currency,
  getCategoryLabel,
  getCategoryColor,
  showMonthlyAverage = false,
  totalMonths = 1,
  limit = 6,
}: CategoryPieChartProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  // Net refunds (negative totals) have no slice
  const slices = categoryBreakdown
    .map((cat) => ({
      category: cat.category,
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
    <div className="flex items-center gap-6">
      {/* Legend: category, amount and share */}
      <div className="flex-1 min-w-0 space-y-0.5">
        {legend.map((s) => {
          const isActive = activeCategory === s.category
          return (
            <div
              key={s.category}
              onMouseEnter={() => setActiveCategory(s.category)}
              onMouseLeave={() => setActiveCategory(null)}
              className="flex items-center justify-between gap-3 py-2 px-2 -mx-2 rounded-lg transition-colors"
              style={{
                backgroundColor: isActive
                  ? `color-mix(in srgb, ${s.fill} 18%, transparent)`
                  : undefined,
              }}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <span
                  className={cn(
                    'rounded-full shrink-0 transition-all',
                    isActive ? 'size-3.5' : 'size-2.5'
                  )}
                  style={{ backgroundColor: s.fill }}
                />
                <span
                  className={cn(
                    'truncate text-sm text-foreground',
                    isActive ? 'font-semibold' : 'font-medium'
                  )}
                >
                  {s.name}
                </span>
              </span>
              <span className="text-right shrink-0">
                <span className="block text-sm font-semibold text-foreground tabular-nums">
                  {formatCurrency(s.value, currency)}
                  {suffix && (
                    <span className="text-[10px] text-muted-foreground font-normal">{suffix}</span>
                  )}
                </span>
                <span className="block text-[11px] text-muted-foreground tabular-nums">
                  {((s.value / sliceTotal) * 100).toFixed(1)}%
                </span>
              </span>
            </div>
          )
        })}
        {slices.length > legend.length && (
          <p className="text-[11px] text-muted-foreground pt-2">
            +{slices.length - legend.length} more categories
          </p>
        )}
      </div>

      {/* Donut with total in the middle */}
      <div className="relative aspect-square w-1/2 max-w-80 shrink-0">
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
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            {showMonthlyAverage ? 'Per month' : 'Total'}
          </span>
          <span className="text-lg font-bold text-foreground tabular-nums">
            {formatCurrency(displayTotal, currency)}
          </span>
        </div>
      </div>
    </div>
  )
}
