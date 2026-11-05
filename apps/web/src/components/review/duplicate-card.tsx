import { Check } from 'lucide-react'
import { AccountAvatar } from '@/components/transactions/transaction-table'
import { cn } from '@/lib/utils'
import { formatShortDate } from '@/lib/date-presets'
import { getAccountShortLabel } from '@/lib/statement-display'
import { CategoryIcon } from '@/components/ui/category-icon'
import { getCategoryColorClasses } from '@/lib/category-colors'
import type { Account, Category, DuplicateGroup, Transaction } from '@/lib/api'

const COLUMNS: Record<number, string> = {
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
}

/** Rewords the API's short reason into calmer, more precise wording */
function polishReason(reason: string): string {
  const days = /^(\d+) days? apart$/.exec(reason)
  if (days) return `${days[1]} ${days[1] === '1' ? 'day' : 'days'} apart`
  const reference = /^Same reference number (.+)$/.exec(reason)
  if (reference) return `Same reference number (${reference[1]})`
  switch (reason) {
    case 'Same day, same amount, similar description':
      return 'Same day, same amount and a closely matching description'
    case 'Same amount, similar description':
      return 'Same amount and a closely matching description'
    case 'Same date and amount, different description':
      return 'Same date and amount, but a different description'
    case 'Same amount, entered by you':
      return 'Same amount, entered by you'
    case 'From 2 different statements':
      return 'Found in two different statements'
    case 'From different sources':
      return 'Recorded from different sources'
    default:
      return reason
  }
}

interface DuplicateGroupCardsProps {
  group: DuplicateGroup
  /** The transaction that stays when the group is merged. Omit for dismissed groups. */
  keeperId?: string
  accounts: Account[]
  categories: Category[]
  countryCode: string
  formatAmount: (amount: number, currency: string) => string
  onMakeKeeper?: (id: string) => void
  /** Merge animation: the copies glide into the kept card ('slide'), which then confirms ('done') */
  mergeStage?: 'slide' | 'done'
}

/** Every transaction of a duplicate group as its own card, the kept one ringed */
export function DuplicateGroupCards({
  group,
  keeperId,
  accounts,
  categories,
  countryCode,
  formatAmount,
  onMakeKeeper,
  mergeStage,
}: DuplicateGroupCardsProps) {
  const dismissed = keeperId === undefined
  const merging = mergeStage !== undefined
  const keeperIndex = group.transactions.findIndex((t) => t.id === keeperId)

  const renderCard = (txn: Transaction, index: number) => {
    const account = accounts.find((a) => a.id === txn.accountId)
    const isKeeper = txn.id === keeperId
    // In a match, the bank message / hand-entered transaction is the one being merged away
    const isProvisional = group.kind === 'match' && txn.id === group.provisionalId
    const name = txn.summary || txn.originalDescription
    const category = categories.find((c) => c.code === txn.category)
    const colors = getCategoryColorClasses(category?.color ?? 'zinc')
    const content = (
      <>
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
            <p className="text-xs text-muted-foreground">{formatShortDate(txn.date)}</p>
          </div>
          {!dismissed &&
            !isProvisional &&
            (isKeeper ? (
              <span className="flex items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-1 pr-3 text-xs font-medium text-primary">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                Keep
              </span>
            ) : (
              <span className="flex items-center gap-1.5 py-1 pl-1 pr-3 text-xs text-muted-foreground transition-colors group-hover/keep:text-foreground">
                <span className="h-5 w-5 rounded-full border border-border transition-colors group-hover/keep:border-foreground/40" />
                Keep
              </span>
            ))}
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={name}>
              {name}
            </p>
            {txn.summary && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {txn.originalDescription}
              </p>
            )}
          </div>
          <p
            className={cn(
              'shrink-0 text-2xl font-semibold tracking-tight tabular-nums',
              txn.type === 'credit' && 'text-positive'
            )}
          >
            {txn.type === 'credit' ? '+' : '-'}
            {formatAmount(txn.amount, txn.currency)}
          </p>
        </div>
        <div className="space-y-3">
          {txn.notes && (
            <p className="line-clamp-2 text-xs italic text-muted-foreground">{txn.notes}</p>
          )}
          <div className="flex items-center justify-between gap-3">
            {category && txn.category !== 'other' ? (
              <span
                className={cn(
                  'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium',
                  colors.bg,
                  colors.text
                )}
              >
                <CategoryIcon code={txn.category} className="h-4 w-4" />
                {category.label}
              </span>
            ) : (
              <span />
            )}
            <p className="shrink-0 text-xs text-muted-foreground">
              {txn.smsSource ? 'Bank message' : 'Statement'}
            </p>
          </div>
        </div>
      </>
    )
    const className = cn(
      'group/keep relative flex min-h-[15rem] flex-col justify-between gap-4 rounded-xl border p-5 text-left transition-all duration-500 ease-in-out motion-reduce:transition-none',
      isKeeper ? 'border-primary/60 bg-primary/[0.04]' : 'border-border-subtle bg-surface-elevated',
      // The kept card dims behind its confirmation once the copies have arrived
      mergeStage === 'done' && isKeeper && '[&>*:not([data-merged])]:opacity-15',
      merging &&
        !isKeeper &&
        'pointer-events-none scale-95 opacity-0 lg:translate-x-(--merge-shift)'
    )
    const style = {
      '--merge-shift': `calc(${keeperIndex - index} * (100% + 1rem))`,
    } as React.CSSProperties
    if (dismissed || isKeeper || isProvisional) {
      return (
        <div key={txn.id} className={className} style={style}>
          {content}
          {isKeeper && merging && (
            <div
              data-merged
              className={cn(
                'absolute inset-0 flex flex-col items-center justify-center gap-3 transition-all duration-500 ease-out',
                mergeStage === 'done' ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
              )}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor">
                  <path
                    d="M5 12.5l4.5 4.5L19 7.5"
                    pathLength={1}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      strokeDasharray: 1,
                      strokeDashoffset: mergeStage === 'done' ? 0 : 1,
                      transition: 'stroke-dashoffset 450ms ease-out 250ms',
                    }}
                  />
                </svg>
              </span>
              <span className="text-sm font-medium text-primary">Merged</span>
            </div>
          )}
        </div>
      )
    }
    return (
      <button
        key={txn.id}
        type="button"
        style={style}
        disabled={merging}
        className={cn(
          className,
          'cursor-pointer hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50'
        )}
        onClick={() => onMakeKeeper?.(txn.id)}
      >
        {content}
      </button>
    )
  }

  return (
    <div className="space-y-3">
      <div
        className={cn('grid gap-4 sm:grid-cols-2', COLUMNS[Math.min(group.transactions.length, 4)])}
      >
        {group.transactions.map(renderCard)}
      </div>
      <div className="mt-6 flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
        {group.reasons.length > 0 && (
          <span className="italic">{group.reasons.map(polishReason).join(' · ')}</span>
        )}
      </div>
    </div>
  )
}
