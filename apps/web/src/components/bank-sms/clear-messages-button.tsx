/**
 * Removes every transaction imported from messages and empties the synced list (after a confirmation)
 */

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
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
import { useClearSmsImport } from '@/hooks'

export function ClearMessagesButton({ disabled }: { disabled: boolean }) {
  const clearMutation = useClearSmsImport()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="outline"
        className="text-destructive hover:text-destructive"
        disabled={disabled || clearMutation.isPending}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Clear
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all synced messages?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes every transaction that was imported from a message and empties this list.
              Transactions from statements or added by hand are not touched. You can sync the
              messages again afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => clearMutation.mutate()}>Clear</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
