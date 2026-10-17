/**
 * What Changed card component
 * Spending changes for one month against the median of the previous months
 */

import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Receipt } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { InlineEmptyState } from '@/components/ui/empty-state'
import { useSpendingChanges } from '@/hooks/useSpendingChanges'
import { cn } from '@/lib/utils'
import { formatCurrency } from './utils'
import type {
  SpendingCategoryChange,
  SpendingChangesResponse,
  SpendingLargeTransaction,
} from '@/lib/api'

/** Category rows shown before large transactions, so at least one large transaction fits */
const MAX_CATEGORY_ITEMS = 4
const MAX_ITEMS = 5

interface WhatChangedCardProps {
  /** Undefined for family view */
  profileId: string | undefined
  enabled: boolean
  getCategoryLabel: (code: string) => string
}

function shiftMonth(month: string, delta: number): string {
  const [year = 0, mon = 1] = month.split('-').map(Number)
  const index = year * 12 + (mon - 1) + delta
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

function formatMonth(month: string): string {
  const [year = 0, mon = 1] = month.split('-').map(Number)
  return new Date(year, mon - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/** First and last day of a YYYY-MM month as YYYY-MM-DD */
function monthRange(month: string): { startDate: string; endDate: string } {
  const [year = 0, mon = 1] = month.split('-').map(Number)
  const lastDay = new Date(year, mon, 0).getDate()
  return { startDate: `${month}-01`, endDate: `${month}-${String(lastDay).padStart(2, '0')}` }
}

function formatPct(pct: number): string {
  return `${pct > 0 ? '+' : ''}${Math.round(pct * 100)}%`
}

type Item =
  | { kind: 'category'; change: SpendingCategoryChange }
  | { kind: 'large'; txn: SpendingLargeTransaction }

export function WhatChangedCard({ profileId, enabled, getCategoryLabel }: WhatChangedCardProps) {
  // Undefined until the user navigates; the API then picks the latest complete month
  const [month, setMonth] = useState<string | undefined>(undefined)
  const { data, isLoading } = useSpendingChanges({ profileId, month }, { enabled })

  const currentMonth = new Date().toLocaleDateString('en-CA').substring(0, 7)
  const shownMonth = data?.month ?? month

  return (
    <Card className="mb-6 border-border-subtle hover:border-border-hover transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              What Changed
            </CardTitle>
            {data && shownMonth && (
              <p className="text-xs text-muted-foreground mt-1">{getSubtitle(data)}</p>
            )}
          </div>
          {shownMonth && (
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Previous month"
                onClick={() => setMonth(shiftMonth(shownMonth, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Next month"
                disabled={shownMonth >= currentMonth}
                onClick={() => setMonth(shiftMonth(shownMonth, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading || !data ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <WhatChangedBody data={data} getCategoryLabel={getCategoryLabel} />
        )}
      </CardContent>
    </Card>
  )
}

function getSubtitle(data: SpendingChangesResponse): string {
  if (data.status === 'insufficient_history') return formatMonth(data.month)
  const count = data.baselineMonths.length
  const partial = data.isPartial ? ' (month to date)' : ''
  return `${formatMonth(data.month)}${partial} vs median of previous ${count} month${count === 1 ? '' : 's'}`
}

function WhatChangedBody({
  data,
  getCategoryLabel,
}: {
  data: SpendingChangesResponse
  getCategoryLabel: (code: string) => string
}) {
  if (data.status === 'insufficient_history') {
    return (
      <InlineEmptyState
        icon={Receipt}
        title="Not enough history yet"
        description={`Needs at least ${data.baselineMonthsRequired} earlier months of data to compare ${formatMonth(data.month)} (${data.baselineMonthsAvailable} available)`}
      />
    )
  }

  const items: Item[] = [
    ...data.categories
      .slice(0, MAX_CATEGORY_ITEMS)
      .map((change) => ({ kind: 'category' as const, change })),
    ...data.largeTransactions.map((txn) => ({ kind: 'large' as const, txn })),
  ].slice(0, MAX_ITEMS)

  if (items.length === 0) {
    return (
      <InlineEmptyState
        icon={Receipt}
        title="No significant changes"
        description={`Spending in ${formatMonth(data.month)} is in line with previous months`}
      />
    )
  }

  const range = monthRange(data.month)

  return (
    <div className="space-y-1">
      {items.map((item) =>
        item.kind === 'category' ? (
          <CategoryChangeRow
            key={`c-${item.change.category}`}
            change={item.change}
            currency={data.currency}
            range={range}
            label={getCategoryLabel(item.change.category)}
          />
        ) : (
          <LargeTransactionRow
            key={`t-${item.txn.id}`}
            txn={item.txn}
            currency={data.currency}
            range={range}
            label={getCategoryLabel(item.txn.category)}
          />
        )
      )}
      {data.note && <p className="text-[11px] text-muted-foreground pt-2">{data.note}</p>}
    </div>
  )
}

interface RowProps {
  currency: string
  range: { startDate: string; endDate: string }
  label: string
}

const ROW_CLASS =
  'flex items-center justify-between gap-4 py-2.5 px-2 -mx-2 rounded-lg hover:bg-surface-elevated transition-colors'

function CategoryChangeRow({
  change,
  currency,
  range,
  label,
}: RowProps & { change: SpendingCategoryChange }) {
  const isUp = change.direction === 'up'
  const Icon = isUp ? ArrowUpRight : ArrowDownRight
  const drivers = change.topMerchants
    .map((m) => `${m.merchant} ${m.count} ${m.count === 1 ? 'txn' : 'txns'}`)
    .join(', ')

  return (
    <Link to="/transactions" search={{ category: change.category, ...range }} className={ROW_CLASS}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{label}</p>
        <p className="text-xs text-muted-foreground truncate">
          vs {formatCurrency(change.baselineMedian, currency)}
          {drivers && ` · ${drivers}`}
        </p>
      </div>
      <div
        className={cn('flex items-center gap-1 shrink-0', isUp ? 'text-negative' : 'text-positive')}
      >
        <Icon className="h-4 w-4" />
        <div className="text-right">
          <p className="text-sm font-medium tabular-nums">
            {formatCurrency(change.current, currency)}
          </p>
          <p className="text-xs tabular-nums">
            {change.deltaPct === null ? 'New' : formatPct(change.deltaPct)}
          </p>
        </div>
      </div>
    </Link>
  )
}

function LargeTransactionRow({
  txn,
  currency,
  range,
  label,
}: RowProps & { txn: SpendingLargeTransaction }) {
  return (
    <Link to="/transactions" search={{ category: txn.category, ...range }} className={ROW_CLASS}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{txn.summary}</p>
        <p className="text-xs text-muted-foreground truncate">
          {label} · {txn.reason === 'new_merchant' ? 'New merchant' : 'Larger than usual'}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0 text-negative">
        <Receipt className="h-4 w-4" />
        <p className="text-sm font-medium tabular-nums">{formatCurrency(txn.amount, currency)}</p>
      </div>
    </Link>
  )
}
