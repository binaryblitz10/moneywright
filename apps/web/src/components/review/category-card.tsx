import { useState } from 'react'
import { Check, ChevronDown, Pencil, Plus } from 'lucide-react'
import { CategoryPicker } from '@/components/transactions/category-picker'
import { AccountAvatar, TransactionTable } from '@/components/transactions/transaction-table'
import { Button } from '@/components/ui/button'
import { CategoryIcon } from '@/components/ui/category-icon'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatDate } from '@/components/dashboard/utils'
import { getCategoryColorClasses } from '@/lib/category-colors'
import { getAccountShortLabel } from '@/lib/statement-display'
import { cn } from '@/lib/utils'
import type { Transaction } from '@/lib/api'
import type { MerchantGroupData } from './merchant-groups'
import type { ReviewPanelProps } from './types'

interface CategoryCardProps extends Omit<ReviewPanelProps, 'filters'> {
  group: MerchantGroupData
  isBusy: boolean
  className?: string
  onChangeAll: (ids: string[], category: string) => void
  /** Confirms the suggested category; the compact card has its own button for it */
  onConfirm?: () => void
  /** Shown at the end of the compact card's button row, e.g. the pager */
  footerEnd?: React.ReactNode
}

export function CategoryCard({
  group,
  isBusy,
  className,
  onChangeAll,
  onConfirm,
  footerEnd,
  ...tableProps
}: CategoryCardProps) {
  const [rowsOpen, setRowsOpen] = useState(false)
  // While the popup is open its rows stay put: the ones the user categorizes keep showing, with
  // their new category, even though they no longer belong to the review queue
  const [openRows, setOpenRows] = useState<Transaction[]>([])
  const [changed, setChanged] = useState<Record<string, string>>({})
  const { transactions } = group
  const first = transactions[0]
  if (!first) return null

  const { accounts, categories, countryCode, formatAmount, onEditTransaction, compact } = tableProps
  const ids = transactions.map((t) => t.id)
  const count = transactions.length
  const isGroup = count > 1

  const account = accounts.find((a) => a.id === first.accountId)
  const category = categories.find((c) => c.code === first.category)
  const colors = getCategoryColorClasses(category?.color ?? 'zinc')
  const hasSuggestion = first.summary !== null && first.category !== 'other'

  const isCredit = isGroup ? group.net >= 0 : first.type === 'credit'
  const amount = isGroup ? Math.abs(group.net) : first.amount

  const picker = (trigger: React.ReactNode) => (
    <CategoryPicker
      categories={categories}
      value=""
      onChange={(code) => code && onChangeAll(ids, code)}
      trigger={trigger}
      fitContent
    />
  )

  return (
    <article
      className={cn(
        'relative flex flex-col border border-border-subtle bg-surface-elevated animate-fade-in',
        compact ? 'gap-4 rounded-xl p-4' : 'justify-between rounded-2xl p-8',
        className
      )}
    >
      <div className="flex items-center gap-3">
        <AccountAvatar
          logoPath={
            account?.institution ? `/institutions/${countryCode}/${account.institution}.svg` : null
          }
          institutionId={account?.institution || 'other'}
          isCard={account?.type === 'credit_card'}
        />
        <div className="min-w-0 flex-1">
          <p className={cn('truncate font-medium', compact ? 'text-sm' : 'text-base')}>
            {account ? getAccountShortLabel(account) : 'Account'}
          </p>
          {!isGroup && <p className="text-xs text-muted-foreground">{formatDate(first.date)}</p>}
        </div>
        {!isGroup && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            aria-label="Edit transaction details"
            onClick={() => onEditTransaction(first)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className={cn('flex items-center justify-between gap-4', compact && 'flex-1')}>
        <div className="min-w-0">
          <p
            className={cn('truncate font-medium', compact ? 'text-sm' : 'text-xl')}
            title={group.name}
          >
            {group.name}
          </p>
          {isGroup ? (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 mt-1 h-7 px-2 text-sm text-muted-foreground"
              onClick={() => {
                setOpenRows(transactions)
                setChanged({})
                setRowsOpen(true)
              }}
            >
              {count} transactions
            </Button>
          ) : (
            first.summary && (
              <p
                className={cn(
                  'truncate text-muted-foreground',
                  compact ? 'mt-0.5 text-xs' : 'mt-1 text-sm'
                )}
              >
                {first.originalDescription}
              </p>
            )
          )}
        </div>
        <p
          className={cn(
            'shrink-0 font-semibold tracking-tight tabular-nums',
            compact ? 'text-2xl' : 'text-4xl',
            isCredit && 'text-positive'
          )}
        >
          {isCredit ? '+' : '-'}
          {formatAmount(amount, first.currency)}
        </p>
      </div>

      {compact ? (
        <>
          {hasSuggestion && (
            <div className="flex items-center gap-2">
              {picker(
                <button
                  type="button"
                  disabled={isBusy}
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium transition hover:brightness-95 disabled:opacity-50',
                    colors.bg,
                    colors.text
                  )}
                >
                  <CategoryIcon code={first.category} className="h-3.5 w-3.5" />
                  {category?.label ?? first.category}
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </button>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {hasSuggestion ? (
              <Button size="sm" disabled={isBusy} onClick={onConfirm}>
                <Check className="mr-2 h-4 w-4" />
                Confirm
              </Button>
            ) : (
              picker(
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isBusy}
                  className="border-dashed text-muted-foreground hover:text-foreground"
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add category
                </Button>
              )
            )}
            {footerEnd}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {picker(
            hasSuggestion ? (
              <button
                type="button"
                disabled={isBusy}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-2 rounded-full font-medium transition hover:brightness-95 disabled:opacity-50',
                  compact ? 'px-3 py-1 text-sm' : 'px-3.5 py-1.5 text-base',
                  colors.bg,
                  colors.text
                )}
              >
                <CategoryIcon code={first.category} className="h-4 w-4" />
                {category?.label ?? first.category}
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isBusy}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-border font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50',
                  compact ? 'px-3 py-1 text-sm' : 'px-3.5 py-1.5 text-base'
                )}
              >
                Uncategorized
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
            )
          )}
        </div>
      )}

      {(isGroup || rowsOpen) && (
        <Dialog open={rowsOpen} onOpenChange={setRowsOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{group.name}</DialogTitle>
              <DialogDescription>
                {openRows.length} transactions from this merchant.
              </DialogDescription>
            </DialogHeader>
            <div className="overflow-auto rounded-lg border border-border-subtle">
              <TransactionTable
                transactions={openRows.map((t) =>
                  changed[t.id]
                    ? { ...t, category: changed[t.id]!, isManuallyCategorized: true }
                    : t
                )}
                onCategoryChanged={(txn, category) =>
                  setChanged((prev) => ({ ...prev, [txn.id]: category }))
                }
                {...tableProps}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </article>
  )
}
