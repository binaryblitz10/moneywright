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
        // Don't auto-focus (and select) the first input when opening
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Edit Transaction</DialogTitle>
          <DialogDescription>{transaction?.originalDescription}</DialogDescription>
        </DialogHeader>
        {transaction && (
          <TransactionEditForm
            key={transaction.id}
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
