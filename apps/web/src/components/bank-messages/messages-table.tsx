/**
 * Synced bank messages and their outcome; a banner opens the messages that need review
 */

import { useState } from 'react'
import { AlertTriangle, MessageSquareText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ReviewIssuesDialog } from '@/components/bank-messages/review-issues-dialog'
import { EditTransactionDialog, TransactionTable } from '@/components/transactions'
import type { Account, Category, PendingSms, SyncedSms, Transaction } from '@/lib/api'

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
  const [editing, setEditing] = useState<Transaction | null>(null)
  // Older months shown beyond Today / This week / This month
  const [extraMonths, setExtraMonths] = useState(0)

  // When each transaction came from a message, for the New pill (pending and dismissed have none)
  const importedAtByTxn = new Map(
    messages.flatMap((m) => (m.transactionId ? [[m.transactionId, m.importedAt] as const] : []))
  )
  const mergedCountByTxn = new Map(
    messages.flatMap((m) => (m.transactionId ? [[m.transactionId, m.mergedCount] as const] : []))
  )
  // Only messages that became a transaction are listed: those waiting for review are in the
  // review dialog, and dismissed ones are left out
  const listed = messages.filter((m) => m.status !== 'needs_review' && m.status !== 'dismissed')
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
  // Rows in groups, newest first; a group is one label's run of rows
  const groups: { label: string; rows: Transaction[] }[] = []
  visible.forEach((m) => {
    if (!m.transaction) return
    const label = labelById.get(m.id)!
    const last = groups[groups.length - 1]
    if (last?.label === label) last.rows.push(m.transaction)
    else groups.push({ label, rows: [m.transaction] })
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
              onEditTransaction={setEditing}
              renderBadge={(txn) => {
                const importedAt = importedAtByTxn.get(txn.id)
                const isNew =
                  !!importedAt && Date.now() - new Date(importedAt).getTime() < NEW_FOR_MS
                const mergedCount = mergedCountByTxn.get(txn.id) ?? 0
                if (!isNew && mergedCount === 0) return null
                return (
                  <>
                    {isNew && (
                      <span
                        className={cn(BADGE_CLASS, 'border-primary/30 bg-primary/10 text-primary')}
                      >
                        New
                      </span>
                    )}
                    {mergedCount > 0 && (
                      <span
                        className={cn(
                          BADGE_CLASS,
                          'border-border-subtle bg-muted text-muted-foreground'
                        )}
                      >
                        Merged · {mergedCount + 1}
                      </span>
                    )}
                  </>
                )
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

      <EditTransactionDialog
        transaction={editing}
        categories={categories}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}
