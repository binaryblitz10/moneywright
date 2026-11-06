/**
 * The bank messages that could not be imported on their own: pick one, then finish or dismiss it
 */

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  focusDialogOnOpen,
} from '@/components/ui/dialog'
import { ReviewForm } from '@/components/bank-messages/review-form'
import type { Account, PendingSms } from '@/lib/api'

interface ReviewIssuesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: PendingSms[]
  accounts: Account[]
  formatAmount: (amount: number, currency: string) => string
}

/** Why a message is waiting, in words */
function issueOf(message: PendingSms, accounts: Account[]): string {
  const account = accounts.find((a) => a.id === message.accountId)
  if (message.amount === null || message.type === null || !message.currency) {
    return 'Some details could not be read from the message'
  }
  if (!account) {
    return message.last4
      ? `Card ending ${message.last4} does not match any account`
      : 'No card digits to find the account'
  }
  if (message.currency !== account.currency) {
    return `Charged in ${message.currency}, but ${account.accountName ?? 'the account'} is in ${account.currency}`
  }
  return 'Sent by a sender that is not a known bank'
}

export function ReviewIssuesDialog({
  open,
  onOpenChange,
  pending,
  accounts,
  formatAmount,
}: ReviewIssuesDialogProps) {
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const reviewing = pending.find((m) => m.id === reviewingId) ?? null
  const activeAccounts = accounts.filter((a) => a.isActive)

  const handleOpenChange = (next: boolean) => {
    if (!next) setReviewingId(null)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex max-h-[min(46rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        onOpenAutoFocus={focusDialogOnOpen}
      >
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{reviewing ? 'Review message' : 'Messages to review'}</DialogTitle>
          <DialogDescription>
            {reviewing
              ? 'Check the details, then add it as a transaction or dismiss it.'
              : `${pending.length} ${pending.length === 1 ? 'message needs' : 'messages need'} a look before ${pending.length === 1 ? 'it becomes a transaction' : 'they become transactions'}.`}
          </DialogDescription>
        </DialogHeader>

        {reviewing ? (
          <>
            <div className="px-6 pt-3">
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 text-muted-foreground"
                onClick={() => setReviewingId(null)}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                All messages
              </Button>
            </div>
            <ReviewForm
              key={reviewing.id}
              message={reviewing}
              accounts={activeAccounts}
              onDone={() => setReviewingId(null)}
              onCancel={() => setReviewingId(null)}
            />
          </>
        ) : (
          <ul className="min-h-0 flex-1 divide-y divide-border-subtle overflow-y-auto px-3 py-3">
            {pending.map((message) => {
              const currency =
                message.currency ?? accounts.find((a) => a.id === message.accountId)?.currency
              return (
                <li key={message.id}>
                  <button
                    type="button"
                    onClick={() => setReviewingId(message.id)}
                    className="group flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-medium">
                          {message.merchant ?? message.sender}
                        </span>
                        {message.amount !== null && currency && (
                          <span className="shrink-0 text-sm font-medium tabular-nums">
                            {message.type === 'credit' ? '+' : '-'}
                            {formatAmount(message.amount, currency)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {message.sender} ·{' '}
                        {new Date(message.receivedAt).toLocaleDateString('en-GB')}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {issueOf(message, accounts)}
                      </p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
