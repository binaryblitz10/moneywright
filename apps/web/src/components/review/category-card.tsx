import { useState } from 'react'
import { ChevronDown, Pencil } from 'lucide-react'
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
}

export function CategoryCard({
  group,
  isBusy,
  className,
  onChangeAll,
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

  const { accounts, categories, countryCode, formatAmount, onEditTransaction } = tableProps
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
        'relative flex flex-col justify-between rounded-2xl border border-border-subtle bg-surface-elevated p-8 animate-fade-in',
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
          <p className="truncate text-base font-medium">
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

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-xl font-medium" title={group.name}>
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
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {first.originalDescription}
              </p>
            )
          )}
        </div>
        <p
          className={cn(
            'shrink-0 text-4xl font-semibold tracking-tight tabular-nums',
            isCredit && 'text-positive'
          )}
        >
          {isCredit ? '+' : '-'}
          {formatAmount(amount, first.currency)}
        </p>
      </div>

      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        {picker(
          hasSuggestion ? (
            <button
              type="button"
              disabled={isBusy}
              className={cn(
                'inline-flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-1.5 text-base font-medium transition hover:brightness-95 disabled:opacity-50',
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
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-border px-3.5 py-1.5 text-base font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50"
            >
              Uncategorized
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </button>
          )
        )}
      </div>

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
