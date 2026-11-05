import { useMemo, useState } from 'react'
import { Check, CheckCheck, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { QueryError } from '@/components/ui/query-error'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useBulkUpdateTransactions, useTransactions } from '@/hooks'
import { CategoryPicker } from '@/components/transactions/category-picker'
import { CategoryCard } from './category-card'
import { ReviewActionButton } from './review-action-button'
import { groupByMerchant } from './merchant-groups'
import type { ReviewPanelProps } from './types'

// Loads a big slice of rows and works through them one merchant at a time
const ROW_LIMIT = 200
// The card is as tall as its content needs, so the deck keeps it and the stack below fixed
const CARD_HEIGHT = 'h-[15rem]'
const DECK_HEIGHT = 'h-[18.5rem]'

export function CategorizationPanel({ filters, ...tableProps }: ReviewPanelProps) {
  // Settled ones leave at once, before the refetch drops them
  const [settled, setSettled] = useState<Set<string>>(new Set())
  const [index, setIndex] = useState(0)

  const mutation = useBulkUpdateTransactions()

  const { data, isLoading, isError, error, refetch } = useTransactions(
    { ...filters, reviewStatus: 'needs_review' },
    { page: 1, limit: ROW_LIMIT, sortBy: 'date', sortOrder: 'desc' }
  )

  const transactions = useMemo(() => data?.transactions ?? [], [data?.transactions])
  const total = data?.total ?? 0
  const groups = useMemo(() => groupByMerchant(transactions), [transactions])

  const deck = groups.filter((g) => !settled.has(g.key))
  const currentIndex = Math.min(index, Math.max(deck.length - 1, 0))
  const current = deck[currentIndex]

  const settle = (key: string, input: { transactionIds: string[]; category?: string }) =>
    mutation.mutate(
      input.category
        ? { transactionIds: input.transactionIds, category: input.category }
        : { transactionIds: input.transactionIds, confirmCategory: true },
      { onSuccess: () => setSettled((prev) => new Set(prev).add(key)) }
    )

  if (isError) return <QueryError error={error} onRetry={() => void refetch()} />
  if (isLoading)
    return <Skeleton className={cn(DECK_HEIGHT, 'mx-auto w-full max-w-3xl rounded-xl')} />
  if (!current) {
    return (
      <EmptyState
        icon={CheckCheck}
        title="All clear"
        description="Every transaction has a confident category."
        size="sm"
        glow
        className={cn(DECK_HEIGHT, 'flex flex-col items-center justify-center')}
      />
    )
  }

  const ids = current.transactions.map((t) => t.id)
  const first = current.transactions[0]
  const hasSuggestion = first !== undefined && first.summary !== null && first.category !== 'other'
  const busy = mutation.isPending

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pt-8">
      <div className={DECK_HEIGHT}>
        <div className="relative pb-3">
          {/* Cards waiting underneath */}
          {deck.length > 2 && (
            <div
              aria-hidden
              className={cn(
                'absolute inset-x-8 top-4 rounded-xl border border-border-subtle bg-surface-elevated/40',
                CARD_HEIGHT
              )}
            />
          )}
          {deck.length > 1 && (
            <div
              aria-hidden
              className={cn(
                'absolute inset-x-4 top-2 rounded-xl border border-border-subtle bg-surface-elevated/70',
                CARD_HEIGHT
              )}
            />
          )}
          <CategoryCard
            key={current.key}
            group={current}
            className={CARD_HEIGHT}
            isBusy={busy}
            onChangeAll={(ids, category) => settle(current.key, { transactionIds: ids, category })}
            {...tableProps}
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-5 pt-2">
        {hasSuggestion ? (
          <ReviewActionButton
            icon={Check}
            label="Confirm"
            disabled={busy}
            onClick={() => settle(current.key, { transactionIds: ids })}
          />
        ) : (
          <CategoryPicker
            categories={tableProps.categories}
            value=""
            onChange={(code) =>
              code && settle(current.key, { transactionIds: ids, category: code })
            }
            fitContent
            trigger={<ReviewActionButton icon={Plus} label="Add category" disabled={busy} />}
          />
        )}
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label="Previous merchant"
            disabled={currentIndex === 0}
            onClick={() => setIndex(currentIndex - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-1 text-sm text-muted-foreground">
            {currentIndex + 1} of {deck.length}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label="Next merchant"
            disabled={currentIndex >= deck.length - 1}
            onClick={() => setIndex(currentIndex + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {total > transactions.length && (
        <p className="text-center text-xs text-muted-foreground">
          Showing the first {transactions.length} of {total} transactions. Settle these to see the
          rest.
        </p>
      )}
    </div>
  )
}
