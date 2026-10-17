import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { useUpdateStatement } from '@/hooks'
import type { Statement } from '@/lib/api'

interface StatementEditDialogProps {
  statement: Statement
  isCreditCard: boolean
  onClose: () => void
}

// The default input fill blends into the dialog background, so give inputs a visible border
const INPUT_CLASS = 'border border-input'

/** Parses a number input, treating an empty field as "no value" */
function parseAmount(value: string): number | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : Number(trimmed)
}

function toInputValue(value: number | null | undefined): string {
  return value == null ? '' : String(value)
}

export function StatementEditDialog({
  statement,
  isCreditCard,
  onClose,
}: StatementEditDialogProps) {
  const updateMutation = useUpdateStatement()

  const summaryTotalDue =
    typeof statement.summary?.totalDue === 'number' ? statement.summary.totalDue : null

  const [periodStart, setPeriodStart] = useState(statement.periodStart ?? '')
  const [periodEnd, setPeriodEnd] = useState(statement.periodEnd ?? '')
  const [periodError, setPeriodError] = useState<string | null>(null)
  // Safari's date fields can show a typed date without firing a change event, so the
  // dates are read from the fields themselves when saving
  const periodStartRef = useRef<HTMLInputElement>(null)
  const periodEndRef = useRef<HTMLInputElement>(null)
  const [totalDue, setTotalDue] = useState(
    toInputValue(summaryTotalDue ?? statement.closingBalance)
  )
  const [openingBalance, setOpeningBalance] = useState(toInputValue(statement.openingBalance))
  const [closingBalance, setClosingBalance] = useState(toInputValue(statement.closingBalance))

  const amounts = isCreditCard ? [totalDue] : [openingBalance, closingBalance]
  const hasInvalidAmount = amounts.some((a) => {
    const parsed = parseAmount(a)
    return parsed !== null && !Number.isFinite(parsed)
  })
  const hasInvalidPeriod = !!periodStart && !!periodEnd && periodStart > periodEnd
  const canSave = !hasInvalidAmount && !hasInvalidPeriod && !updateMutation.isPending

  const handleSave = () => {
    const startInput = periodStartRef.current
    const endInput = periodEndRef.current
    // badInput: something was typed that isn't a complete date, which would otherwise save as empty
    if (startInput?.validity.badInput || endInput?.validity.badInput) {
      setPeriodError('Enter complete dates, or clear the field.')
      return
    }
    const start = startInput?.value ?? periodStart
    const end = endInput?.value ?? periodEnd
    if (start && end && start > end) {
      setPeriodError('Period start must be on or before period end.')
      return
    }
    setPeriodError(null)

    updateMutation.mutate(
      {
        statementId: statement.id,
        data: {
          periodStart: start || null,
          periodEnd: end || null,
          ...(isCreditCard
            ? { totalDue: parseAmount(totalDue) }
            : {
                openingBalance: parseAmount(openingBalance),
                closingBalance: parseAmount(closingBalance),
              }),
        },
      },
      { onSuccess: onClose }
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Statement</DialogTitle>
          <DialogDescription className="truncate">{statement.originalFilename}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="periodStart">Period start</Label>
              <Input
                id="periodStart"
                ref={periodStartRef}
                type="date"
                value={periodStart}
                className={INPUT_CLASS}
                onChange={(e) => setPeriodStart(e.target.value)}
                onBlur={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="periodEnd">Period end</Label>
              <Input
                id="periodEnd"
                ref={periodEndRef}
                type="date"
                value={periodEnd}
                className={INPUT_CLASS}
                onChange={(e) => setPeriodEnd(e.target.value)}
                onBlur={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
          {hasInvalidPeriod ? (
            <p className="text-xs text-negative">Period start must be on or before period end.</p>
          ) : (
            periodError && <p className="text-xs text-negative">{periodError}</p>
          )}

          {isCreditCard ? (
            <div className="space-y-2">
              <Label htmlFor="totalDue">Total due</Label>
              <Input
                id="totalDue"
                type="number"
                step="0.01"
                value={totalDue}
                className={INPUT_CLASS}
                onChange={(e) => setTotalDue(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Shown as the card's outstanding balance.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="openingBalance">Opening balance</Label>
                <Input
                  id="openingBalance"
                  type="number"
                  step="0.01"
                  value={openingBalance}
                  className={INPUT_CLASS}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="closingBalance">Closing balance</Label>
                <Input
                  id="closingBalance"
                  type="number"
                  step="0.01"
                  value={closingBalance}
                  className={INPUT_CLASS}
                  onChange={(e) => setClosingBalance(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
