import { useState } from 'react'
import { Check, ChevronDown, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { CategoryPicker } from '@/components/transactions/category-picker'
import { TransactionTable } from '@/components/transactions/transaction-table'
import { cn } from '@/lib/utils'
import type { MerchantGroupData } from './merchant-groups'
import type { ReviewPanelProps } from './types'

const SOURCE_HINTS: Record<string, string> = {
  ai: 'by AI',
  memory: 'from memory',
  rule: 'by a rule',
  user: 'by you',
}

interface MerchantGroupProps extends Omit<ReviewPanelProps, 'filters'> {
  group: MerchantGroupData
  isBusy: boolean
  onConfirmAll: (ids: string[]) => void
  onChangeAll: (ids: string[], category: string) => void
}

export function MerchantGroup({
  group,
  isBusy,
  onConfirmAll,
  onChangeAll,
  ...tableProps
}: MerchantGroupProps) {
  const [open, setOpen] = useState(false)
  const { transactions } = group
  const first = transactions[0]
  if (!first) return null
  const ids = transactions.map((t) => t.id)
  const count = transactions.length

  const categories = new Set(transactions.map((t) => t.category))
  const categoryLabel =
    categories.size === 1 ? tableProps.getCategoryLabel(first.category) : 'Mixed'
  const sources = new Set(transactions.map((t) => t.categorySource ?? ''))
  const sourceHint = sources.size === 1 ? SOURCE_HINTS[first.categorySource ?? ''] : undefined
  const currency = first.currency
  const net = tableProps.formatAmount(Math.abs(group.net), currency)

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-xl border border-border-subtle bg-surface-elevated"
    >
      <div className="flex flex-wrap items-center gap-3 p-3">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300',
              !open && '-rotate-90'
            )}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{group.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {count} transaction{count === 1 ? '' : 's'} · {group.net < 0 ? '-' : ''}
              {net} · {categoryLabel}
              {sourceHint ? ` ${sourceHint}` : ''}
            </p>
          </div>
        </CollapsibleTrigger>
        <div className="flex items-center gap-2">
          <CategoryPicker
            categories={tableProps.categories}
            value=""
            onChange={(code) => code && onChangeAll(ids, code)}
            contentAlign="end"
            fitContent
            trigger={
              <Button size="sm" variant="outline" disabled={isBusy}>
                <Pencil className="mr-2 h-4 w-4" />
                Change all
              </Button>
            }
          />
          <Button size="sm" disabled={isBusy} onClick={() => onConfirmAll(ids)}>
            <Check className="mr-2 h-4 w-4" />
            Confirm all
          </Button>
        </div>
      </div>
      <CollapsibleContent className="border-t border-border-subtle">
        <TransactionTable transactions={transactions} {...tableProps} />
      </CollapsibleContent>
    </Collapsible>
  )
}
