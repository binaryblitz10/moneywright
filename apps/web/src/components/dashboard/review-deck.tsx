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
  /** Everything waiting in the queue, beyond the ones loaded */
  total: number
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
  total,
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
  // The total still counts the ones settled since the last refetch
  const remaining = total - (transactions.length - open.length)

  if (isLoading) return <Skeleton className="h-52 w-full rounded-xl" />
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
      contentClassName="w-80"
    />
  )

  return (
    <div className="relative pb-3">
      {/* Cards waiting underneath */}
      {deck.length > 2 && (
        <div
          aria-hidden
          className="absolute inset-x-6 bottom-0 h-full rounded-xl border border-border-subtle bg-surface-elevated/40"
        />
      )}
      {deck.length > 1 && (
        <div
          aria-hidden
          className="absolute inset-x-3 bottom-1.5 h-full rounded-xl border border-border-subtle bg-surface-elevated/70"
        />
      )}

      <article
        key={current.id}
        className="relative flex flex-col gap-4 rounded-xl border border-border-subtle bg-surface-elevated p-4 animate-fade-in"
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
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            aria-label="Edit transaction details"
            onClick={() => onEdit(current)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-medium">{name}</p>
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

        {queue === 'check' ? (
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
              <span>{Math.round(current.categoryConfidence * 100)}% sure</span>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {category ? `Filed under ${category.label}` : 'No category yet'}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {queue === 'check' ? (
            <>
              <Button size="sm" disabled={busy} onClick={() => settle()}>
                <Check className="mr-1.5 h-4 w-4" />
                Looks right
              </Button>
              {picker(
                <Button size="sm" variant="outline" disabled={busy}>
                  Change
                </Button>
              )}
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
              className="ml-auto text-muted-foreground"
              onClick={() =>
                setSkipped((prev) => [...prev.filter((id) => id !== current.id), current.id])
              }
            >
              Skip
              <SkipForward className="ml-1.5 h-4 w-4" />
            </Button>
          )}
        </div>
      </article>

      <p className="mt-3 text-center text-xs text-muted-foreground tabular-nums">
        {remaining} left
      </p>
    </div>
  )
}
