import * as React from 'react'
import { cn } from '@/lib/utils'
import { Link } from '@tanstack/react-router'
import { Card, CardContent } from './card'
import { Skeleton } from './skeleton'
import { ArrowUpRight, ArrowDownRight, type LucideIcon } from 'lucide-react'

// Format full number with currency
function formatFull(amount: number, currency: string = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

// Get font size class based on value string length
function getValueFontSize(valueStr: string): string {
  const len = valueStr.length
  if (len > 16) return 'text-sm sm:text-base'
  if (len > 13) return 'text-base sm:text-lg'
  if (len > 10) return 'text-lg sm:text-xl'
  return 'text-xl sm:text-2xl'
}

export interface StatCardProps {
  /** The label displayed above the value (e.g., "Net Worth", "Monthly Expenses") */
  label: string
  /** The numeric value to display */
  value?: number | null
  /** Currency code for formatting (default: INR) */
  currency?: string
  /** Subtitle text displayed below the value */
  subtitle?: string
  /** Icon component from lucide-react */
  icon?: LucideIcon
  /** Show loading skeleton */
  loading?: boolean
  /** Trend direction - shows up/down arrow indicator */
  trend?: 'up' | 'down'
  /** If true, treats as a simple count (no currency formatting) */
  isCount?: boolean
  /** If true, formats as percentage (no currency, 2 decimal places) */
  isPercentage?: boolean
  /** Prefix to add before the value (e.g., "+") */
  prefix?: string
  /** Suffix to add after the value (e.g., "%") */
  suffix?: string
  /** Custom formatter for the value */
  formatValue?: (value: number, currency: string) => string
  /** Additional class name for the card */
  className?: string
  /** Makes the card a link to the transactions page with these filters applied */
  transactionsLink?: {
    category?: string
    startDate?: string
    endDate?: string
  }
}

/**
 * StatCard - A consistent stat display component for dashboards
 *
 * Design spec from design.md:
 * - Label: text-xs, uppercase, tracking-wider, text-muted
 * - Value: text-2xl or text-3xl, font-semibold
 * - Subtitle: text-sm, text-secondary
 * - Icon: ALWAYS in top-right corner
 * - Icon background: surface-elevated with subtle border
 * - Icon color: text-secondary (NOT colored)
 * - Value color: text-primary default, semantic ONLY for +/- indicators
 */
export function StatCard({
  label,
  value,
  currency = 'INR',
  subtitle,
  icon: Icon,
  loading = false,
  trend,
  isCount = false,
  isPercentage = false,
  prefix,
  suffix,
  formatValue,
  className,
  transactionsLink,
}: StatCardProps) {
  // Format the display value
  const { displayValue, fontSize } = React.useMemo(() => {
    if (value === undefined || value === null) {
      return { displayValue: '—', fontSize: 'text-xl sm:text-2xl' }
    }
    if (isCount) {
      return { displayValue: value.toLocaleString(), fontSize: 'text-xl sm:text-2xl' }
    }
    if (isPercentage) {
      const formatted = `${prefix || ''}${value.toFixed(2)}${suffix || ''}`
      return { displayValue: formatted, fontSize: 'text-xl sm:text-2xl' }
    }
    if (formatValue) {
      const formatted = formatValue(value, currency)
      return { displayValue: formatted, fontSize: getValueFontSize(formatted) }
    }

    const formatted = `${prefix || ''}${formatFull(value, currency)}${suffix || ''}`
    return { displayValue: formatted, fontSize: getValueFontSize(formatted) }
  }, [value, currency, isCount, isPercentage, prefix, suffix, formatValue])

  const card = (
    <Card
      className={cn(
        'relative overflow-hidden hover:border-border-hover transition-all duration-200 animate-fade-in',
        transactionsLink && 'h-full cursor-pointer',
        className
      )}
    >
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between gap-3">
          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Label */}
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              {label}
            </p>

            {/* Value */}
            {loading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              // Fixed height so the length-based font size never changes the card height
              <div className="flex h-8 items-center gap-2">
                <p
                  className={cn(
                    'font-semibold tracking-tight text-foreground tabular-nums truncate',
                    fontSize
                  )}
                >
                  {displayValue}
                </p>

                {/* Trend indicator */}
                {trend && value !== undefined && value !== null && value !== 0 && !isCount && (
                  <span
                    className={cn(
                      'flex items-center text-xs font-medium shrink-0',
                      trend === 'up' ? 'text-positive' : 'text-negative'
                    )}
                  >
                    {trend === 'up' ? (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5" />
                    )}
                  </span>
                )}
              </div>
            )}

            {/* Subtitle */}
            {subtitle && <p className="text-xs text-muted-foreground mt-1.5">{subtitle}</p>}
          </div>

          {/* Icon */}
          {Icon && (
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg shrink-0',
                'bg-surface-elevated border border-border-subtle'
              )}
            >
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )

  if (!transactionsLink) return card

  return (
    <Link to="/transactions" search={transactionsLink} className="block">
      {card}
    </Link>
  )
}

/**
 * StatCardGrid - A responsive grid container for stat cards
 */
export function StatCardGrid({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn('grid gap-4 md:grid-cols-2 lg:grid-cols-4', className)}>{children}</div>
}
