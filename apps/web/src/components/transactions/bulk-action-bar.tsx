import { useState } from 'react'
import { FLOATING_BAR_CLASS } from './floating-bar'
import { Eye, EyeOff, Loader2, Pencil, Trash2, X } from 'lucide-react'
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
import { useBulkDeleteTransactions, useBulkUpdateTransactions } from '@/hooks'
import type { Category } from '@/lib/api'
import { CategoryPicker } from './category-picker'

interface BulkActionBarProps {
  selectedIds: Set<string>
  /** Transactions matching the current filters (all of them when unfiltered), across all pages */
  totalMatching: number
  /** Whether any filter or search narrows the list */
  filtered: boolean
  /** True when every row on the current page is selected */
  pageFullySelected: boolean
  categories: Category[]
  /** Viewing hidden transactions, so the hide action becomes unhide */
  showingHidden: boolean
  selectingAll: boolean
  onSelectAllMatching: () => void
  onEdit: () => void
  onClear: () => void
}

/** Sticky bar with the actions that apply to the selected transactions */
export function BulkActionBar({
  selectedIds,
  totalMatching,
  filtered,
  pageFullySelected,
  categories,
  showingHidden,
  selectingAll,
  onSelectAllMatching,
  onEdit,
  onClear,
}: BulkActionBarProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const updateMutation = useBulkUpdateTransactions()
  const deleteMutation = useBulkDeleteTransactions()

  const transactionIds = [...selectedIds]
  const count = transactionIds.length
  const busy = updateMutation.isPending || deleteMutation.isPending
  const allMatchingSelected = count >= totalMatching

  return (
    <div className={FLOATING_BAR_CLASS}>
      <div className="flex flex-wrap items-center gap-x-3 text-sm">
        <span className="font-medium">{count.toLocaleString()} selected</span>
        {allMatchingSelected
          ? totalMatching > 1 && (
              <span className="text-muted-foreground">
                {filtered ? 'All matching transactions selected' : 'All transactions selected'}
              </span>
            )
          : pageFullySelected && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0"
                disabled={selectingAll}
                onClick={onSelectAllMatching}
              >
                {selectingAll && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                Select all {totalMatching.toLocaleString()}{' '}
                {filtered ? 'matching transactions' : 'transactions'}
              </Button>
            )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-44">
          <CategoryPicker
            categories={categories}
            value=""
            placeholder="Categorize"
            triggerClassName="h-8 px-3"
            contentClassName="w-96"
            onChange={(category) => {
              if (!category) return
              updateMutation.mutate({ transactionIds, category }, { onSuccess: onClear })
            }}
          />
        </div>
        <Button size="sm" variant="outline" aria-label="Edit" disabled={busy} onClick={onEdit}>
          <Pencil className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Edit</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-label={showingHidden ? 'Unhide' : 'Hide'}
          disabled={busy}
          onClick={() =>
            updateMutation.mutate(
              { transactionIds, isHidden: !showingHidden },
              { onSuccess: onClear }
            )
          }
        >
          {showingHidden ? (
            <Eye className="h-4 w-4 sm:mr-2" />
          ) : (
            <EyeOff className="h-4 w-4 sm:mr-2" />
          )}
          <span className="hidden sm:inline">{showingHidden ? 'Unhide' : 'Hide'}</span>
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive hover:text-destructive"
          aria-label="Delete"
          disabled={busy}
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Delete</span>
        </Button>
        <Button size="sm" variant="ghost" aria-label="Clear selection" onClick={onClear}>
          <X className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Clear</span>
        </Button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {count.toLocaleString()} transaction{count === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes them and cannot be undone. To keep them out of your totals
              without deleting, use Hide instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(transactionIds, { onSuccess: onClear })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
