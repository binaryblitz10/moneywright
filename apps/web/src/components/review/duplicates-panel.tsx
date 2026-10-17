import { useState } from 'react'
import { CheckCheck, EyeOff, Loader2, RotateCcw, ShieldCheck, Trash2, X } from 'lucide-react'
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
import {
  useBulkDeleteTransactions,
  useBulkUpdateTransactions,
  useDismissDuplicates,
  useDuplicateGroups,
} from '@/hooks'
import { Pagination } from '@/components/transactions/pagination'
import { TransactionTable } from '@/components/transactions/transaction-table'
import type { ReviewPanelProps } from './types'

const GROUPS_PER_PAGE = 10

export function DuplicatesPanel({ filters, formatAmount, ...tableProps }: ReviewPanelProps) {
  const { data: activeGroups = [], isLoading, isPlaceholderData } = useDuplicateGroups(filters)
  const { data: dismissedGroups = [] } = useDuplicateGroups({ ...filters, dismissed: true })
  const dismissMutation = useDismissDuplicates()
  const [showDismissed, setShowDismissed] = useState(false)
  const viewingDismissed = showDismissed && dismissedGroups.length > 0
  const groups = viewingDismissed ? dismissedGroups : activeGroups
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

  const handleDismiss = (signature: string) => {
    // Restoring the last dismissed group empties that view, so leave it for good
    if (viewingDismissed && dismissedGroups.length === 1) setShowDismissed(false)
    dismissMutation.mutate({ signatures: [signature], dismissed: !viewingDismissed })
  }

  const handleHide = () => {
    hideMutation.mutate(
      { transactionIds: [...selectedIds], isHidden: true },
      { onSuccess: resolved }
    )
  }

  if (isLoading) return <TableSkeleton rows={6} columns={4} />

  const dismissedToggle = dismissedGroups.length > 0 && (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-0 text-xs text-muted-foreground hover:text-foreground"
      onClick={() => {
        setShowDismissed((value) => !value)
        setPage(1)
        setManualSelection(null)
      }}
    >
      {viewingDismissed
        ? 'Back to duplicates'
        : `${dismissedGroups.length} marked as not duplicates`}
    </Button>
  )

  if (groups.length === 0 && !viewingDismissed) {
    return (
      <div className="space-y-2">
        <EmptyState
          icon={CheckCheck}
          title="No duplicates found"
          description="No transactions share the same account, date, amount and description."
        />
        {dismissedToggle}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {viewingDismissed
          ? `${groups.length} group${groups.length === 1 ? '' : 's'} you marked as not duplicates. They come back if another identical transaction is added.`
          : `${groups.length} group${groups.length === 1 ? '' : 's'} of transactions with the same account, date, type, amount and description. The oldest entry in each group is kept by default.`}
      </p>
      {dismissedToggle}

      {!viewingDismissed && selectedIds.size > 0 && (
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
              Delete
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={handleHide}>
              <EyeOff className="mr-2 h-4 w-4" />
              Hide
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
          <div key={group.key} className="space-y-2">
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                disabled={dismissMutation.isPending}
                onClick={() => handleDismiss(group.signature)}
              >
                {viewingDismissed ? (
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                )}
                {viewingDismissed ? 'Mark as duplicates again' : 'Not a duplicate'}
              </Button>
            </div>
            <TransactionTable
              transactions={group.transactions}
              formatAmount={formatAmount}
              selectedIds={selectedIds}
              onSelectionChange={setManualSelection}
              {...tableProps}
            />
          </div>
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
