import { useState } from 'react'
import { FLOATING_BAR_CLASS } from '@/components/transactions/floating-bar'
import {
  CheckCheck,
  ChevronRight,
  EyeOff,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { EmptyState } from '@/components/ui/empty-state'
import { TableSkeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  useBulkDeleteTransactions,
  useBulkUpdateTransactions,
  useDismissDuplicates,
  useDuplicateGroups,
} from '@/hooks'
import { Pagination } from '@/components/transactions/pagination'
import { TransactionTable } from '@/components/transactions/transaction-table'
import type { DuplicateGroup, Transaction } from '@/lib/api'
import type { ReviewPanelProps } from './types'

const GROUPS_PER_PAGE = 10

export function DuplicatesPanel({ filters, formatAmount, ...tableProps }: ReviewPanelProps) {
  const { data: groups = [], isLoading, isPlaceholderData } = useDuplicateGroups(filters)
  const { data: dismissedGroups = [] } = useDuplicateGroups({ ...filters, dismissed: true })
  const dismissMutation = useDismissDuplicates()
  const deleteMutation = useBulkDeleteTransactions()
  const hideMutation = useBulkUpdateTransactions()
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)

  const totalPages = Math.ceil(groups.length / GROUPS_PER_PAGE)
  const currentPage = Math.min(page, Math.max(totalPages, 1))
  const visibleGroups = groups.slice(
    (currentPage - 1) * GROUPS_PER_PAGE,
    currentPage * GROUPS_PER_PAGE
  )

  const busy = deleteMutation.isPending || hideMutation.isPending
  const resolved = () => setSelectedIds(new Set())

  const handleDelete = () => {
    deleteMutation.mutate([...selectedIds], { onSuccess: resolved })
    setConfirmDelete(false)
  }

  const handleDismiss = (signature: string, dismissed: boolean) => {
    dismissMutation.mutate({ signatures: [signature], dismissed })
  }

  const handleHide = () => {
    hideMutation.mutate(
      { transactionIds: [...selectedIds], isHidden: true },
      { onSuccess: resolved }
    )
  }

  // One heading row per group, shown above its first transaction
  const groupHeader = (list: DuplicateGroup[], dismissed: boolean) => (txn: Transaction) => {
    const group = list.find((g) => g.transactions[0]?.id === txn.id)
    if (!group) return null
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {group.transactions.length} transactions
          </span>
          {' · '}
          {formatAmount(group.transactions[0]!.amount, group.transactions[0]!.currency)}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          disabled={dismissMutation.isPending}
          onClick={() => handleDismiss(group.signature, !dismissed)}
        >
          {dismissed ? (
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
          ) : (
            <ShieldCheck className="mr-2 h-3.5 w-3.5" />
          )}
          {dismissed ? 'Mark as duplicates' : 'Not a duplicate'}
        </Button>
      </div>
    )
  }

  if (isLoading) return <TableSkeleton rows={6} columns={4} />

  const dismissedSection = dismissedGroups.length > 0 && (
    <Collapsible className="group/dismissed space-y-4">
      <CollapsibleTrigger
        className={cn(
          'w-full rounded-xl px-4 py-2 text-left transition-all duration-300',
          'bg-linear-to-b from-card to-card/80',
          'border border-border-subtle',
          'shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]',
          'dark:shadow-[0_1px_3px_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.15)]'
        )}
      >
        <div className="flex h-7 items-center gap-3 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]/dismissed:rotate-90" />
          <span>Marked as not duplicates</span>
          <span className="ml-auto text-xs">{dismissedGroups.length}</span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <TransactionTable
          transactions={dismissedGroups.flatMap((g) => g.transactions)}
          formatAmount={formatAmount}
          renderGroupHeader={groupHeader(dismissedGroups, true)}
          {...tableProps}
        />
      </CollapsibleContent>
    </Collapsible>
  )

  if (groups.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={CheckCheck}
          title="No duplicates found"
          description="No transactions share the same account, date, amount and description."
        />
        {dismissedSection}
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', selectedIds.size > 0 && 'pb-24')}>
      {selectedIds.size > 0 && (
        <div className={FLOATING_BAR_CLASS}>
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={handleHide}>
              <EyeOff className="mr-2 h-4 w-4" />
              Hide
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={resolved}>
              <X className="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>
        </div>
      )}

      <div className={cn('transition-opacity duration-200', isPlaceholderData && 'opacity-60')}>
        <TransactionTable
          transactions={visibleGroups.flatMap((g) => g.transactions)}
          formatAmount={formatAmount}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          renderGroupHeader={groupHeader(visibleGroups, false)}
          {...tableProps}
        />
      </div>

      {totalPages > 1 && (
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          total={groups.length}
          limit={GROUPS_PER_PAGE}
          onPageChange={setPage}
        />
      )}

      {dismissedSection}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Permanently delete {selectedIds.size} transaction{selectedIds.size === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This can't be undone. Use "Hide" to keep them out of your totals but recoverable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
