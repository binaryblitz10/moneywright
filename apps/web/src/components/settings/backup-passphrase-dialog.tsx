import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const MIN_LENGTH = 8

interface BackupPassphraseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (passphrase: string) => void
}

/** Asks for the passphrase that locks a downloaded backup */
export function BackupPassphraseDialog({
  open,
  onOpenChange,
  onSubmit,
}: BackupPassphraseDialogProps) {
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')

  const mismatch = confirm.length > 0 && confirm !== passphrase
  const valid = passphrase.length >= MIN_LENGTH && passphrase === confirm

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setPassphrase('')
      setConfirm('')
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!valid) return
            onSubmit(passphrase)
            handleOpenChange(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>Lock this backup with a passphrase</DialogTitle>
            <DialogDescription>
              The file includes the key that unlocks your saved passwords and account numbers, so it
              is encrypted. Keep the passphrase safe: it cannot be recovered.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="backup-passphrase">Passphrase</Label>
            <Input
              id="backup-passphrase"
              type="password"
              autoComplete="new-password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder={`At least ${MIN_LENGTH} characters`}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="backup-passphrase-confirm">Repeat passphrase</Label>
            <Input
              id="backup-passphrase-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={mismatch}
            />
            {mismatch && <p className="text-xs text-destructive">Passphrases do not match</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid}>
              Download backup
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
