import { useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Category, Transaction } from '@/lib/api'
import { TransactionEditForm } from './transaction-edit-form'

interface EditTransactionDialogProps {
  /** The transaction being edited; the dialog is open while this is set */
  transaction: Transaction | null
  categories: Category[]
  onClose: () => void
}

/** Dialog for editing one transaction, shared by the transactions and review pages */
export function EditTransactionDialog({
  transaction,
  categories,
  onClose,
}: EditTransactionDialogProps) {
  const queryClient = useQueryClient()

  return (
    <Dialog open={!!transaction} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        // Fixed height so the dialog doesn't grow when the Create rule button appears.
        // The header and the form's buttons stay put; only the fields scroll.
        className="flex h-[min(46rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        // Don't auto-focus (and select) the first input when opening
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Edit Transaction</DialogTitle>
          <DialogDescription>{transaction?.originalDescription}</DialogDescription>
        </DialogHeader>
        {transaction && (
          <TransactionEditForm
            key={transaction.id}
            pinnedFooter
            transaction={transaction}
            categories={categories}
            onClose={onClose}
            onSuccess={() => {
              onClose()
              queryClient.invalidateQueries({ queryKey: ['transactions'] })
              // Invalidate entity payment histories in case linking changed
              queryClient.invalidateQueries({ queryKey: ['loans'] })
              queryClient.invalidateQueries({ queryKey: ['insurance'] })
              queryClient.invalidateQueries({ queryKey: ['accounts'] })
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
