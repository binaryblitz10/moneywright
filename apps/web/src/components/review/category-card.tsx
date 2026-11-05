import { useState } from 'react'
import { Check, Pencil, Plus } from 'lucide-react'
import { CategoryPicker } from '@/components/transactions/category-picker'
import { AccountAvatar, TransactionTable } from '@/components/transactions/transaction-table'
import { Button } from '@/components/ui/button'
import { CategoryIcon } from '@/components/ui/category-icon'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { formatDate } from '@/components/dashboard/utils'
import { getCategoryColorClasses } from '@/lib/category-colors'
import { getAccountShortLabel } from '@/lib/statement-display'
import { cn } from '@/lib/utils'
import type { MerchantGroupData } from './merchant-groups'
import type { ReviewPanelProps } from './types'

interface CategoryCardProps extends Omit<ReviewPanelProps, 'filters'> {
  group: MerchantGroupData
  isBusy: boolean
  onConfirmAll: (ids: string[]) => void
  onChangeAll: (ids: string[], category: string) => void
}

export function CategoryCard({
  group,
  isBusy,
  onConfirmAll,
  onChangeAll,
  ...tableProps
}: CategoryCardProps) {
  const [open, setOpen] = useState(false)
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

  const confidences = transactions.flatMap((t) =>
    t.categoryConfidence === null ? [] : [t.categoryConfidence]
  )
  const confidence = confidences.length
    ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100)
    : null

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
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="flex flex-col gap-4 rounded-xl border border-border-subtle bg-surface-elevated p-4"
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
          <p className="truncate text-sm font-medium">
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
          <p className="truncate text-sm font-medium" title={group.name}>
            {group.name}
          </p>
          {isGroup ? (
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 mt-0.5 h-6 px-2 text-xs text-muted-foreground"
              >
                {count} transactions
              </Button>
            </CollapsibleTrigger>
          ) : (
            first.summary && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {first.originalDescription}
              </p>
            )
          )}
        </div>
        <p
          className={cn(
            'shrink-0 text-2xl font-semibold tracking-tight tabular-nums',
            isCredit && 'text-positive'
          )}
        >
          {isCredit ? '+' : '-'}
          {formatAmount(amount, first.currency)}
        </p>
      </div>

      {hasSuggestion && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium',
              colors.bg,
              colors.text
            )}
          >
            <CategoryIcon code={first.category} className="h-3.5 w-3.5" />
            {category?.label ?? first.category}
          </span>
          {confidence !== null && <span>{confidence}% confidence</span>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {hasSuggestion ? (
          <>
            <Button size="sm" disabled={isBusy} onClick={() => onConfirmAll(ids)}>
              <Check className="mr-2 h-4 w-4" />
              Mark as correct
            </Button>
            {picker(
              <Button size="sm" variant="outline" disabled={isBusy}>
                <Pencil className="mr-2 h-4 w-4" />
                Change
              </Button>
            )}
          </>
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
      </div>

      {isGroup && (
        <CollapsibleContent className="overflow-hidden rounded-lg border border-border-subtle">
          <TransactionTable transactions={transactions} {...tableProps} />
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}
