/**
 * Every synced bank message with its outcome; messages that need attention open a review dialog
 */

import { useState } from 'react'
import { MessageSquareText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ReviewForm } from '@/components/bank-sms/review-form'
import { EditTransactionDialog, TransactionTable } from '@/components/transactions'
import type { Account, Category, PendingSms, SyncedSms, Transaction } from '@/lib/api'

type Filter = 'all' | SyncedSms['status']

const OUTCOME_BADGES: Partial<Record<SyncedSms['status'], string>> = {
  needs_review: 'Needs review',
  dismissed: 'Dismissed',
}

/** How long a freshly imported transaction is marked New */
const NEW_FOR_MS = 24 * 60 * 60 * 1000

const BADGE_CLASS =
  'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0'

function toDateString(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** A message with no transaction (waiting for review, or dismissed) shown as a table row */
function toPlaceholderTransaction(message: SyncedSms, date: string | null): Transaction {
  return {
    id: message.id,
    accountId: message.accountId ?? '',
    statementId: '',
    profileId: '',
    userId: '',
    date: date ?? toDateString(message.receivedAt),
    type: message.type ?? 'debit',
    amount: message.amount ?? 0,
    currency: message.currency ?? '',
    originalDescription: message.merchant ?? '—',
    summary: null,
    category: 'other',
    categoryConfidence: null,
    isSubscription: false,
    linkedEntityId: null,
    linkedEntityType: null,
    isManuallyCategorized: false,
    isHidden: false,
    smsSource: false,
    smsVerified: false,
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
  const [filter, setFilter] = useState<Filter>(pending.length > 0 ? 'needs_review' : 'all')
  const [reviewing, setReviewing] = useState<PendingSms | null>(null)
  const [editing, setEditing] = useState<Transaction | null>(null)

  // When each transaction came from a message, for the New pill (pending and dismissed have none)
  const importedAtByTxn = new Map(
    messages.flatMap((m) => (m.transactionId ? [[m.transactionId, m.importedAt] as const] : []))
  )
  const pendingById = new Map(pending.map((m) => [m.id, m]))
  const count = (status: SyncedSms['status']): number =>
    messages.filter((m) => m.status === status).length
  const visible = filter === 'all' ? messages : messages.filter((m) => m.status === filter)
  // Rows without a transaction of their own are keyed by message id
  const statusById = new Map(
    visible.filter((m) => !m.transaction).map((m) => [m.id, m.status] as const)
  )
  const rows = visible.map(
    (m) => m.transaction ?? toPlaceholderTransaction(m, pendingById.get(m.id)?.date ?? null)
  )

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
        <TransactionTable
          transactions={rows}
          accounts={accounts}
          categories={categories}
          countryCode={countryCode}
          getCategoryLabel={getCategoryLabel}
          formatAmount={formatAmount}
          onEditTransaction={(txn) => {
            const waiting = pendingById.get(txn.id)
            if (waiting) setReviewing(waiting)
            else setEditing(txn)
          }}
          isEditable={(txn) => !statusById.has(txn.id) || pendingById.has(txn.id)}
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
            const isNew = !!importedAt && Date.now() - new Date(importedAt).getTime() < NEW_FOR_MS
            return isNew ? (
              <span className={cn(BADGE_CLASS, 'border-primary/30 bg-primary/10 text-primary')}>
                New
              </span>
            ) : null
          }}
        />
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

      <EditTransactionDialog
        transaction={editing}
        categories={categories}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}
