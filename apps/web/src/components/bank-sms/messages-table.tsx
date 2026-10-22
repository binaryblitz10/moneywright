/**
 * Every synced bank message with its outcome; messages that need attention open a review dialog
 */

import { useState } from 'react'
import { Check, MessageSquareText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ReviewForm } from '@/components/bank-sms/review-form'
import type { Account, PendingSms, SyncedSms } from '@/lib/api'

type Filter = 'all' | SyncedSms['status']

const STATUS_LABELS: Record<SyncedSms['status'], string> = {
  imported: 'Imported',
  needs_review: 'Needs review',
  dismissed: 'Dismissed',
  verified: 'Verified',
}

function formatAmount(message: SyncedSms): string {
  if (message.amount === null) return '—'
  const amount = new Intl.NumberFormat(message.currency === 'INR' ? 'en-IN' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(message.amount)
  const sign = message.type === 'credit' ? '+' : message.type === 'debit' ? '-' : ''
  return `${sign}${message.currency ?? ''} ${amount}`.trim()
}

interface MessagesTableProps {
  messages: SyncedSms[]
  pending: PendingSms[]
  accounts: Account[]
  lastSyncAt: string | null
}

export function MessagesTable({ messages, pending, accounts, lastSyncAt }: MessagesTableProps) {
  const [filter, setFilter] = useState<Filter>(pending.length > 0 ? 'needs_review' : 'all')
  const [reviewing, setReviewing] = useState<PendingSms | null>(null)

  const accountNames = new Map(accounts.map((a) => [a.id, a.accountName ?? a.institution ?? '']))
  const pendingById = new Map(pending.map((m) => [m.id, m]))
  const count = (status: SyncedSms['status']): number =>
    messages.filter((m) => m.status === status).length
  const visible = filter === 'all' ? messages : messages.filter((m) => m.status === filter)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          aria-label="Filter messages"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All (${messages.length})` },
            { value: 'needs_review', label: `Needs review (${count('needs_review')})` },
            { value: 'imported', label: `Imported (${count('imported')})` },
            { value: 'verified', label: `Verified (${count('verified')})` },
            { value: 'dismissed', label: `Dismissed (${count('dismissed')})` },
          ]}
        />
        {lastSyncAt && (
          <p className="text-xs text-muted-foreground">
            Last synced {new Date(lastSyncAt).toLocaleTimeString()}
          </p>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="No messages here"
          description={
            messages.length === 0
              ? 'Press Sync to read your bank messages, or sync from an earlier date in Settings.'
              : 'No messages match this filter.'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-subtle bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Received</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-28">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((message) => {
                const waiting = pendingById.get(message.id)
                return (
                  <TableRow key={message.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(message.receivedAt).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="truncate font-medium">
                        {message.merchant ?? waiting?.body ?? '—'}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{message.sender}</p>
                    </TableCell>
                    <TableCell>
                      {(message.accountId && accountNames.get(message.accountId)) ||
                        (message.last4 ? `Ending ${message.last4}` : '—')}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {formatAmount(message)}
                    </TableCell>
                    <TableCell>
                      {waiting ? (
                        <Button size="sm" variant="outline" onClick={() => setReviewing(waiting)}>
                          Review
                        </Button>
                      ) : (
                        <Badge
                          variant={
                            message.status === 'imported' || message.status === 'verified'
                              ? 'secondary'
                              : 'outline'
                          }
                          className={
                            message.status === 'verified'
                              ? 'gap-1 text-emerald-700 dark:text-emerald-400'
                              : undefined
                          }
                        >
                          {message.status === 'verified' && <Check className="h-3 w-3" />}
                          {STATUS_LABELS[message.status]}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!reviewing} onOpenChange={(open) => !open && setReviewing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Review message</DialogTitle>
            <DialogDescription>
              Check the details, then add it as a transaction or dismiss it.
            </DialogDescription>
          </DialogHeader>
          {reviewing && (
            <ReviewForm
              key={reviewing.id}
              message={reviewing}
              accounts={accounts.filter((a) => a.isActive)}
              onDone={() => setReviewing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
