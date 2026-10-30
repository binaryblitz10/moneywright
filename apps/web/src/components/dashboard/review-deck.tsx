import { useState } from 'react'
import { Check, CheckCheck, Pencil, Plus, SkipForward } from 'lucide-react'
import { CategoryPicker } from '@/components/transactions/category-picker'
import { AccountAvatar } from '@/components/transactions/transaction-table'
import { Button } from '@/components/ui/button'
import { CategoryIcon } from '@/components/ui/category-icon'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useResolveReviewItem } from '@/hooks'
import { getCategoryColorClasses } from '@/lib/category-colors'
import { getAccountShortLabel } from '@/lib/statement-display'
import { cn } from '@/lib/utils'
import { formatDate } from './utils'
import type { Account, Category, Transaction } from '@/lib/api'

export type ReviewQueue = 'categorize' | 'check'

// The Low confidence card is the tallest, so every card and state of the deck takes its
// height and switching tabs or settling a card never moves what is below
const CARD_HEIGHT = 'h-[13.5rem]'
/** A card plus the cards peeking out underneath it */
const DECK_HEIGHT = 'h-[14.25rem]'

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount)
}

interface ReviewDeckProps {
  queue: ReviewQueue
  /** The next transactions of the queue */
  transactions: Transaction[]
  isLoading: boolean
  accounts: Account[]
  categories: Category[]
  countryCode: string
  onEdit: (transaction: Transaction) => void
}

/** The queue as a stack of cards: settle the top one and the next takes its place */
export function ReviewDeck({
  queue,
  transactions,
  isLoading,
  accounts,
  categories,
  countryCode,
  onEdit,
}: ReviewDeckProps) {
  // Settled ones leave at once, before the refetch drops them; skipped ones go to the back
  const [settled, setSettled] = useState<Set<string>>(new Set())
  const [skipped, setSkipped] = useState<string[]>([])
  const resolve = useResolveReviewItem()

  const open = transactions.filter((t) => !settled.has(t.id))
  const deck = [
    ...open.filter((t) => !skipped.includes(t.id)),
    ...skipped.flatMap((id) => open.filter((t) => t.id === id)),
  ]
  const current = deck[0]

  if (isLoading) return <Skeleton className={cn(DECK_HEIGHT, 'w-full rounded-xl')} />
  if (!current) {
    return (
      <EmptyState
        icon={CheckCheck}
        title="All caught up"
        description={
          queue === 'check'
            ? 'No categories are waiting for a second look.'
            : 'Every transaction has a category.'
        }
        size="sm"
        glow
        className={cn(DECK_HEIGHT, 'flex flex-col items-center justify-center')}
      />
    )
  }

  const account = accounts.find((a) => a.id === current.accountId)
  const category = categories.find((c) => c.code === current.category)
  const colors = getCategoryColorClasses(category?.color ?? 'zinc')
  const name = current.summary || current.originalDescription
  const busy = resolve.isPending

  const settle = (code?: string) =>
    resolve.mutate(
      { transactionId: current.id, category: code },
      { onSuccess: () => setSettled((prev) => new Set(prev).add(current.id)) }
    )

  const picker = (trigger: React.ReactNode) => (
    <CategoryPicker
      categories={categories}
      value=""
      onChange={(code) => code && settle(code)}
      trigger={trigger}
      contentClassName="w-[26rem] max-w-[calc(100vw-2rem)]"
    />
  )

  return (
    <div className={DECK_HEIGHT}>
      <div className="relative pb-3">
        {/* Cards waiting underneath */}
        {deck.length > 2 && (
          <div
            aria-hidden
            className={cn(
              'absolute inset-x-6 top-3 rounded-xl border border-border-subtle bg-surface-elevated/40',
              CARD_HEIGHT
            )}
          />
        )}
        {deck.length > 1 && (
          <div
            aria-hidden
            className={cn(
              'absolute inset-x-3 top-1.5 rounded-xl border border-border-subtle bg-surface-elevated/70',
              CARD_HEIGHT
            )}
          />
        )}

        <article
          key={current.id}
          className={cn(
            'relative flex flex-col gap-4 rounded-xl border border-border-subtle bg-surface-elevated p-4 animate-fade-in',
            CARD_HEIGHT
          )}
        >
          <div className="flex items-center gap-3">
            <AccountAvatar
              logoPath={
                account?.institution
                  ? `/institutions/${countryCode}/${account.institution}.svg`
                  : null
              }
              institutionId={account?.institution || 'other'}
              isCard={account?.type === 'credit_card'}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {account ? getAccountShortLabel(account) : 'Account'}
              </p>
              <p className="text-xs text-muted-foreground">{formatDate(current.date)}</p>
            </div>
            {/* The Low confidence card has its own Edit button */}
            {queue !== 'check' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                aria-label="Edit transaction details"
                onClick={() => onEdit(current)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="flex flex-1 items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium" title={name}>
                {name}
              </p>
              {current.summary && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {current.originalDescription}
                </p>
              )}
            </div>
            <p
              className={cn(
                'shrink-0 text-2xl font-semibold tracking-tight tabular-nums',
                current.type === 'credit' && 'text-positive'
              )}
            >
              {current.type === 'credit' ? '+' : '-'}
              {formatAmount(current.amount, current.currency)}
            </p>
          </div>

          {queue === 'check' && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium',
                  colors.bg,
                  colors.text
                )}
              >
                <CategoryIcon code={current.category} className="h-3.5 w-3.5" />
                {category?.label ?? current.category}
              </span>
              {current.categoryConfidence !== null && (
                <span>{Math.round(current.categoryConfidence * 100)}% confidence</span>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {queue === 'check' ? (
              <>
                <Button size="sm" disabled={busy} onClick={() => settle()}>
                  <Check className="mr-2 h-4 w-4" />
                  Mark as correct
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => onEdit(current)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              </>
            ) : (
              picker(
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  className="border-dashed text-muted-foreground hover:text-foreground"
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add category
                </Button>
              )
            )}
            {deck.length > 1 && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                className="ml-auto h-7 px-2 text-xs text-muted-foreground"
                onClick={() =>
                  setSkipped((prev) => [...prev.filter((id) => id !== current.id), current.id])
                }
              >
                Skip
                <SkipForward className="size-2.5" />
              </Button>
            )}
          </div>
        </article>
      </div>
    </div>
  )
}
