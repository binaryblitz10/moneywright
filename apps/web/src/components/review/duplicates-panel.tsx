import { useState } from 'react'
import { CheckCheck, EyeOff, Loader2, Trash2, X } from 'lucide-react'
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
import { EmptyState } from '@/components/ui/empty-state'
import { TableSkeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useBulkDeleteTransactions, useBulkUpdateTransactions, useDuplicateGroups } from '@/hooks'
import { Pagination } from '@/components/transactions/pagination'
import { TransactionTable } from '@/components/transactions/transaction-table'
import type { ReviewPanelProps } from './types'

const GROUPS_PER_PAGE = 10

export function DuplicatesPanel({ filters, formatAmount, ...tableProps }: ReviewPanelProps) {
  const { data: groups = [], isLoading, isPlaceholderData } = useDuplicateGroups(filters)
  const deleteMutation = useBulkDeleteTransactions()
  const hideMutation = useBulkUpdateTransactions()
  const [page, setPage] = useState(1)
  // null = nothing touched yet, so every row except the oldest in each group is selected
  const [manualSelection, setManualSelection] = useState<Set<string> | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const defaultSelection = new Set(groups.flatMap((g) => g.transactions.slice(1).map((t) => t.id)))
  const selectedIds = manualSelection ?? defaultSelection

  const totalPages = Math.ceil(groups.length / GROUPS_PER_PAGE)
  const currentPage = Math.min(page, Math.max(totalPages, 1))
  const visibleGroups = groups.slice(
    (currentPage - 1) * GROUPS_PER_PAGE,
    currentPage * GROUPS_PER_PAGE
  )

  const busy = deleteMutation.isPending || hideMutation.isPending
  const resolved = () => setManualSelection(null)

  const handleDelete = () => {
    deleteMutation.mutate([...selectedIds], { onSuccess: resolved })
    setConfirmDelete(false)
  }

  const handleHide = () => {
    hideMutation.mutate(
      { transactionIds: [...selectedIds], isHidden: true },
      { onSuccess: resolved }
    )
  }

  if (isLoading) return <TableSkeleton rows={6} columns={4} />

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={CheckCheck}
        title="No duplicates found"
        description="No transactions share the same account, date, amount and description."
      />
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {groups.length} group{groups.length === 1 ? '' : 's'} of transactions with the same account,
        date, type, amount and description. The oldest entry in each group is kept by default.
      </p>

      {selectedIds.size > 0 && (
        <div className="sticky top-2 z-10 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-card px-4 py-2 shadow-sm">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2">
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
              Delete selected
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={handleHide}>
              <EyeOff className="mr-2 h-4 w-4" />
              Hide instead
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setManualSelection(new Set())}>
              <X className="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>
        </div>
      )}

      <div
        className={cn(
          'space-y-6 transition-opacity duration-200',
          isPlaceholderData && 'opacity-60'
        )}
      >
        {visibleGroups.map((group) => (
          <TransactionTable
            key={group.key}
            transactions={group.transactions}
            formatAmount={formatAmount}
            selectedIds={selectedIds}
            onSelectionChange={setManualSelection}
            {...tableProps}
          />
        ))}
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

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Permanently delete {selectedIds.size} transaction{selectedIds.size === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This can't be undone. Use "Hide instead" to keep them out of your totals but
              recoverable.
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
