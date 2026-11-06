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
import { groupByMerchant, type MerchantGroupData } from './merchant-groups'
import type { ReviewPanelProps } from './types'

// Loads a big slice of rows and works through them one merchant at a time
const ROW_LIMIT = 200
// The card is as tall as its content needs, so the deck keeps it and the stack below fixed
const CARD_HEIGHT = 'h-[15rem]'
const DECK_HEIGHT = 'h-[18.5rem]'
// The dashboard widget's card keeps this size; spare height goes above and below it
const COMPACT_CARD_HEIGHT = 'h-[13.5rem]'
const COMPACT_DECK_HEIGHT = 'h-[14.25rem]'

export function CategorizationPanel({ filters, compact, ...tableProps }: ReviewPanelProps) {
  // Settled ones leave at once, before the refetch drops them
  const [settled, setSettled] = useState<Set<string>>(new Set())
  const [index, setIndex] = useState(0)
  // Which way the deck last moved; none until the first move, so the first card just fades in
  const [direction, setDirection] = useState<'next' | 'prev' | null>(null)
  // The card on show, and the one that just left, kept on screen while it animates out
  const [shown, setShown] = useState<MerchantGroupData | null>(null)
  const [leaving, setLeaving] = useState<{
    group: MerchantGroupData
    direction: 'next' | 'prev'
  } | null>(null)
  // The merchant on show stays on show when the list reorders under it, e.g. after one of its
  // transactions is categorized in the transactions dialog
  const [activeKey, setActiveKey] = useState<string | null>(null)

  const mutation = useBulkUpdateTransactions()

  const { data, isLoading, isError, error, refetch } = useTransactions(
    { ...filters, reviewStatus: 'needs_review' },
    { page: 1, limit: ROW_LIMIT, sortBy: 'date', sortOrder: 'desc' }
  )

  const transactions = useMemo(() => data?.transactions ?? [], [data?.transactions])
  const total = data?.total ?? 0
  const groups = useMemo(() => groupByMerchant(transactions), [transactions])

  const deck = groups.filter((g) => !settled.has(g.key))
  const anchoredIndex = deck.findIndex((g) => g.key === activeKey)
  const currentIndex =
    anchoredIndex >= 0 ? anchoredIndex : Math.min(index, Math.max(deck.length - 1, 0))
  const current = deck[currentIndex]
  const currentKey = current?.key

  // Adjusting state while rendering is React's way of following a value that changed
  if (currentKey && currentKey !== activeKey) setActiveKey(currentKey)
  if (current && shown?.key !== current.key) {
    if (shown) setLeaving({ group: shown, direction: direction ?? 'next' })
    setShown(current)
  }

  const goTo = (next: number) => {
    setDirection(next < currentIndex ? 'prev' : 'next')
    setIndex(next)
    setActiveKey(deck[next]?.key ?? null)
  }

  const settle = (key: string, input: { transactionIds: string[]; category?: string }) =>
    mutation.mutate(
      input.category
        ? { transactionIds: input.transactionIds, category: input.category }
        : { transactionIds: input.transactionIds, confirmCategory: true },
      {
        onSuccess: () => {
          setDirection('next')
          setSettled((prev) => new Set(prev).add(key))
        },
      }
    )

  if (isError) return <QueryError error={error} onRetry={() => void refetch()} />
  if (isLoading)
    return (
      <Skeleton
        className={cn(
          compact ? COMPACT_DECK_HEIGHT : DECK_HEIGHT,
          'mx-auto w-full max-w-3xl rounded-xl'
        )}
      />
    )
  if (!current) {
    return (
      <EmptyState
        icon={CheckCheck}
        title="No Pending Transactions"
        size="sm"
        glow
        className={cn(
          'flex flex-col items-center justify-center',
          compact ? 'min-h-[11rem] flex-1' : 'min-h-[18.5rem]'
        )}
      />
    )
  }

  const cardHeight = compact ? COMPACT_CARD_HEIGHT : CARD_HEIGHT
  const deckHeight = compact ? COMPACT_DECK_HEIGHT : DECK_HEIGHT
  // A card waiting underneath, at its stack position (set with --deck-n)
  const layerClass = cn(
    'deck-layer absolute inset-x-0 top-0 border border-border-subtle bg-surface-elevated',
    compact ? 'rounded-xl' : 'rounded-2xl',
    cardHeight
  )
  const layerMotion =
    direction === 'next' ? 'animate-deck-advance' : direction === 'prev' && 'animate-deck-recede'

  const ids = current.transactions.map((t) => t.id)
  const first = current.transactions[0]
  const hasSuggestion = first !== undefined && first.summary !== null && first.category !== 'other'
  const busy = mutation.isPending

  // The widget's pager sits in the card, as two arrows
  const arrows = (
    <div className="ml-auto flex items-center">
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-muted-foreground"
        aria-label="Previous merchant"
        disabled={currentIndex === 0}
        onClick={() => goTo(currentIndex - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-muted-foreground"
        aria-label="Next merchant"
        disabled={currentIndex >= deck.length - 1}
        onClick={() => goTo(currentIndex + 1)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-3xl',
        compact ? 'flex flex-1 flex-col justify-center gap-3' : 'space-y-4 pt-8'
      )}
    >
      <div className={deckHeight}>
        {/* Each stack step is one --deck-dy lower and --deck-ds narrower */}
        <div
          className={cn(
            'relative pb-3',
            compact
              ? '[--deck-dy:0.375rem] [--deck-ds:0.05]'
              : '[--deck-dy:0.5rem] [--deck-ds:0.04]'
          )}
        >
          {/* Cards waiting underneath, remounted on every move so they shift up or back a step */}
          {deck.length > 2 && (
            <div
              key={`back-${current.key}`}
              aria-hidden
              className={cn(
                layerClass,
                '[--deck-n:2]',
                direction === 'next' ? 'animate-deck-advance-in' : layerMotion
              )}
            />
          )}
          {deck.length > 1 && (
            <div
              key={`under-${current.key}`}
              aria-hidden
              className={cn(layerClass, '[--deck-n:1]', layerMotion)}
            />
          )}
          {/* Going forward the old card is thrown off over the deck; going back it sinks into
              the first stack position, under the card coming back */}
          {leaving && (
            <div
              key={leaving.group.key}
              inert
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-x-0 top-0',
                leaving.direction === 'next'
                  ? 'z-20 animate-deck-throw'
                  : 'deck-layer animate-deck-recede [--deck-n:1]'
              )}
              onAnimationEnd={(e) => {
                if (e.target === e.currentTarget) setLeaving(null)
              }}
            >
              <CategoryCard
                group={leaving.group}
                className={cn(
                  cardHeight,
                  '!animate-none',
                  leaving.direction === 'next' && 'shadow-lg'
                )}
                compact={compact}
                isBusy
                footerEnd={compact ? arrows : undefined}
                onChangeAll={() => undefined}
                {...tableProps}
              />
            </div>
          )}
          <CategoryCard
            key={current.key}
            group={current}
            className={cn(
              cardHeight,
              direction === 'next' && 'animate-deck-advance',
              direction === 'prev' && 'animate-deck-return'
            )}
            compact={compact}
            isBusy={busy}
            onConfirm={() => settle(current.key, { transactionIds: ids })}
            footerEnd={compact ? arrows : undefined}
            onChangeAll={(ids, category) => settle(current.key, { transactionIds: ids, category })}
            {...tableProps}
          />
        </div>
      </div>

      {!compact && (
        <div className="flex flex-col items-center gap-5 pt-2">
          {/* Same shape as the Duplicates button group (button + link) so the pagination lines up */}
          <div className="flex flex-col items-center gap-3">
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
            <div aria-hidden className="h-5" />
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              aria-label="Previous merchant"
              disabled={currentIndex === 0}
              onClick={() => goTo(currentIndex - 1)}
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
              onClick={() => goTo(currentIndex + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {total > transactions.length && (
        <p className="text-center text-xs text-muted-foreground">
          Showing the first {transactions.length} of {total} transactions. Settle these to see the
          rest.
        </p>
      )}
    </div>
  )
}
