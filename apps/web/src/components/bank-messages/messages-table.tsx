/**
 * Synced bank messages and their outcome; a banner opens the messages that need review
 */

import { useState } from 'react'
import { AlertTriangle, Loader2, MessageSquareText, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ReviewIssuesDialog } from '@/components/bank-messages/review-issues-dialog'
import { EditTransactionDialog, TransactionTable } from '@/components/transactions'
import { useRestoreDismissedSms } from '@/hooks'
import type { Account, Category, PendingSms, SyncedSms, Transaction } from '@/lib/api'

const OUTCOME_BADGES: Partial<Record<SyncedSms['status'], string>> = {
  dismissed: 'Dismissed',
}

/** How long a freshly imported transaction is marked New */
const NEW_FOR_MS = 24 * 60 * 60 * 1000

const BADGE_CLASS =
  'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0'

const DAY_MS = 86_400_000
/** Groups that always show; each older month loads on demand */
const ALWAYS_SHOWN = ['Today', 'This week', 'This month']

/** "Today", "This week", "This month", else the month name, by when the message arrived */
function groupLabel(iso: string, now: Date): string {
  const date = new Date(iso)
  if (date.toDateString() === now.toDateString()) return 'Today'
  if (now.getTime() - date.getTime() < 7 * DAY_MS) return 'This week'
  if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) {
    return 'This month'
  }
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function toDateString(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** A message with no transaction (waiting for review, or dismissed) shown as a table row */
function toPlaceholderTransaction(
  message: SyncedSms,
  date: string | null,
  fallbackCurrency: string
): Transaction {
  return {
    id: message.id,
    accountId: message.accountId ?? '',
    statementId: '',
    profileId: '',
    userId: '',
    date: date ?? toDateString(message.receivedAt),
    type: message.type ?? 'debit',
    amount: message.amount ?? 0,
    // A message that could not be fully read has no currency, which cannot be formatted blank
    currency: message.currency ?? fallbackCurrency,
    originalDescription: message.merchant ?? '—',
    summary: null,
    category: 'other',
    categoryConfidence: null,
    isSubscription: false,
    linkedEntityId: null,
    linkedEntityType: null,
    isManuallyCategorized: false,
    isHidden: false,
    notes: null,
    smsSource: false,
    smsVerified: false,
    merchantFingerprint: null,
    categorySource: null,
    nameSource: null,
    createdAt: message.receivedAt,
    updatedAt: message.receivedAt,
  }
}

interface MessagesTableProps {
  messages: SyncedSms[]
  pending: PendingSms[]
  accounts: Account[]
  categories: Category[]
  countryCode: string
  getCategoryLabel: (code: string) => string
  formatAmount: (amount: number, currency: string) => string
  lastSyncAt: string | null
}

export function MessagesTable({
  messages,
  pending,
  accounts,
  categories,
  countryCode,
  getCategoryLabel,
  formatAmount,
  lastSyncAt,
}: MessagesTableProps) {
  const [reviewOpen, setReviewOpen] = useState(false)
  const [restoring, setRestoring] = useState<SyncedSms | null>(null)
  const restoreMutation = useRestoreDismissedSms()
  const [editing, setEditing] = useState<Transaction | null>(null)
  // Older months shown beyond Today / This week / This month
  const [extraMonths, setExtraMonths] = useState(0)

  // When each transaction came from a message, for the New pill (pending and dismissed have none)
  const importedAtByTxn = new Map(
    messages.flatMap((m) => (m.transactionId ? [[m.transactionId, m.importedAt] as const] : []))
  )
  // Messages waiting for review are handled in the review dialog, not listed in the table
  const listed = messages.filter((m) => m.status !== 'needs_review')
  const matching = listed
  const now = new Date()
  const labelById = new Map(matching.map((m) => [m.id, groupLabel(m.receivedAt, now)] as const))
  // Older months in order, newest first
  const olderMonths = [
    ...new Set(matching.map((m) => labelById.get(m.id)!).filter((l) => !ALWAYS_SHOWN.includes(l))),
  ]
  const shownMonths = new Set(olderMonths.slice(0, extraMonths))
  const visible = matching.filter((m) => {
    const label = labelById.get(m.id)!
    return ALWAYS_SHOWN.includes(label) || shownMonths.has(label)
  })
  const hiddenMonths = olderMonths.length - shownMonths.size
  // Rows without a transaction of their own are keyed by message id
  const statusById = new Map(
    visible.filter((m) => !m.transaction).map((m) => [m.id, m.status] as const)
  )
  const accountById = new Map(accounts.map((a) => [a.id, a]))
  const rows = visible.map(
    (m) =>
      m.transaction ??
      toPlaceholderTransaction(
        m,
        null,
        (m.accountId ? accountById.get(m.accountId)?.currency : undefined) ??
          accounts[0]?.currency ??
          'USD'
      )
  )

  // Rows in groups, newest first; a group is one label's run of rows
  const groups: { label: string; rows: Transaction[] }[] = []
  visible.forEach((m, i) => {
    const label = labelById.get(m.id)!
    const last = groups[groups.length - 1]
    if (last?.label === label) last.rows.push(rows[i]!)
    else groups.push({ label, rows: [rows[i]!] })
  })

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-card px-4 py-3"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
          <p className="min-w-0 flex-1 text-sm">
            {pending.length} {pending.length === 1 ? 'message needs' : 'messages need'} your review
            before {pending.length === 1 ? 'it can be' : 'they can be'} added as transactions.
          </p>
          <Button size="sm" variant="outline" onClick={() => setReviewOpen(true)}>
            Review issues
          </Button>
        </div>
      )}
      {lastSyncAt && (
        <p className="text-right text-xs text-muted-foreground">
          Last synced {new Date(lastSyncAt).toLocaleTimeString()}
        </p>
      )}

      {matching.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="No messages here"
          description={
            messages.length === 0
              ? 'Press Sync to read your bank messages, or sync from an earlier date in Settings.'
              : 'Messages waiting for review are in the banner above.'
          }
        />
      ) : (
        groups.map((group) => (
          <div key={group.label} className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            <TransactionTable
              hideHeader
              transactions={group.rows}
              accounts={accounts}
              categories={categories}
              countryCode={countryCode}
              getCategoryLabel={getCategoryLabel}
              formatAmount={formatAmount}
              onEditTransaction={(txn) => {
                const dismissed = visible.find((m) => m.id === txn.id && m.status === 'dismissed')
                if (dismissed) setRestoring(dismissed)
                else setEditing(txn)
              }}
              isCategoryEditable={(txn) => !statusById.has(txn.id)}
              renderBadge={(txn) => {
                const status = statusById.get(txn.id)
                if (status) {
                  const label = OUTCOME_BADGES[status]
                  return label ? (
                    <span className={cn(BADGE_CLASS, 'border-border-subtle text-muted-foreground')}>
                      {label}
                    </span>
                  ) : null
                }
                const importedAt = importedAtByTxn.get(txn.id)
                const isNew =
                  !!importedAt && Date.now() - new Date(importedAt).getTime() < NEW_FOR_MS
                return isNew ? (
                  <span className={cn(BADGE_CLASS, 'border-primary/30 bg-primary/10 text-primary')}>
                    New
                  </span>
                ) : null
              }}
            />
          </div>
        ))
      )}

      {hiddenMonths > 0 && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={() => setExtraMonths((n) => n + 1)}>
            Show more
          </Button>
        </div>
      )}

      <ReviewIssuesDialog
        open={reviewOpen && pending.length > 0}
        onOpenChange={setReviewOpen}
        pending={pending}
        accounts={accounts}
        formatAmount={formatAmount}
      />

      <Dialog open={!!restoring} onOpenChange={(open) => !open && setRestoring(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dismissed message</DialogTitle>
            <DialogDescription>
              {restoring?.sender} ·{' '}
              {restoring && new Date(restoring.receivedAt).toLocaleString('en-GB')}
              <br />
              Restore it to review it again and add it as a transaction.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRestoring(null)}>
              Close
            </Button>
            <Button
              disabled={restoreMutation.isPending}
              onClick={() =>
                restoring &&
                restoreMutation.mutate(restoring.id, { onSuccess: () => setRestoring(null) })
              }
            >
              {restoreMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Undo2 className="mr-2 h-4 w-4" />
              )}
              Restore
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <EditTransactionDialog
        transaction={editing}
        categories={categories}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}
