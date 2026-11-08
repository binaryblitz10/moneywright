/**
 * Your data: export everything out, or erase it (local mode)
 */

import { useState } from 'react'
import { Download, Loader2, Trash2 } from 'lucide-react'
import { SectionCard } from '@/components/ui/section-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { useEraseData, useExportTransactions } from '@/hooks'

const ERASE_WORD = 'ERASE'

interface YourDataSectionProps {
  /** With sign-in on, erasing is done by deleting the account instead */
  canErase: boolean
}

export function YourDataSection({ canErase }: YourDataSectionProps) {
  const exportMutation = useExportTransactions()
  const eraseMutation = useEraseData()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [typed, setTyped] = useState('')

  return (
    <SectionCard
      title="Your data"
      description="Take your transactions with you as a spreadsheet, or remove everything from this computer."
      contentClassName="space-y-3"
    >
      <div className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-elevated px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Export transactions</p>
          <p className="text-xs text-muted-foreground">
            Every transaction from all your profiles, as a CSV file. To export a filtered list, use
            Export on the Transactions page.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => exportMutation.mutate(undefined)}
          disabled={exportMutation.isPending}
        >
          {exportMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Export CSV
        </Button>
      </div>

      {canErase && (
        <div className="flex flex-col gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Erase all data</p>
            <p className="text-xs text-muted-foreground">
              Permanently remove all profiles, accounts, transactions, rules and chats. Your PIN and
              AI provider settings stay. Backups already saved are not touched.
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="shrink-0"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Erase all data
          </Button>
        </div>
      )}

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open)
          if (!open) setTyped('')
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Erase all your data?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Consider saving a backup first. Type {ERASE_WORD} to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={ERASE_WORD}
            aria-label={`Type ${ERASE_WORD} to confirm`}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={typed !== ERASE_WORD}
              onClick={() => eraseMutation.mutate()}
            >
              Erase all data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  )
}
