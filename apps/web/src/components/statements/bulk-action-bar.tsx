import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
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
import { FLOATING_BAR_CLASS } from '@/components/transactions/floating-bar'
import { useBulkDeleteStatements } from '@/hooks'

interface BulkActionBarProps {
  selectedIds: Set<string>
  /** Statements currently visible, for the select all shortcut */
  totalVisible: number
  onSelectAll: () => void
  onClear: () => void
}

/** Sticky bar with the actions that apply to the selected statements */
export function BulkActionBar({
  selectedIds,
  totalVisible,
  onSelectAll,
  onClear,
}: BulkActionBarProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const deleteMutation = useBulkDeleteStatements()

  const ids = [...selectedIds]
  const count = ids.length

  return (
    <div className={FLOATING_BAR_CLASS}>
      <div className="flex flex-wrap items-center gap-x-3 text-sm">
        <span className="font-medium">{count.toLocaleString()} selected</span>
        {count < totalVisible && (
          <Button variant="link" size="sm" className="h-auto p-0" onClick={onSelectAll}>
            Select all {totalVisible.toLocaleString()}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="text-destructive hover:text-destructive"
          disabled={deleteMutation.isPending}
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear}>
          <X className="mr-2 h-4 w-4" />
          Clear
        </Button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {count.toLocaleString()} statement{count === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the statements along with their transactions and holdings.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate(ids, { onSuccess: onClear })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
