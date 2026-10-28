/**
 * Every synced bank message with its outcome; messages that need attention open a review dialog
 */

import { useState } from 'react'
import { ListChecks, Loader2, MessageSquareText, Search, Undo2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ReviewForm } from '@/components/bank-messages/review-form'
import {
  BulkActionBar,
  EditTransactionDialog,
  TransactionEditForm,
  TransactionTable,
} from '@/components/transactions'
import { useRestoreDismissedSms } from '@/hooks'
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
    notes: null,
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
  const [restoring, setRestoring] = useState<SyncedSms | null>(null)
  const restoreMutation = useRestoreDismissedSms()
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [search, setSearch] = useState('')

  // When each transaction came from a message, for the New pill (pending and dismissed have none)
  const importedAtByTxn = new Map(
    messages.flatMap((m) => (m.transactionId ? [[m.transactionId, m.importedAt] as const] : []))
  )
  const pendingById = new Map(pending.map((m) => [m.id, m]))
  const count = (status: SyncedSms['status']): number =>
    messages.filter((m) => m.status === status).length
  const query = search.trim().toLowerCase()
  const matchesSearch = (m: SyncedSms): boolean =>
    !query ||
    [
      m.sender,
      m.merchant,
      m.last4,
      m.transaction?.originalDescription,
      m.transaction?.summary,
    ].some((field) => field?.toLowerCase().includes(query))
  const visible = messages.filter(
    (m) => (filter === 'all' || m.status === filter) && matchesSearch(m)
  )
  // Rows without a transaction of their own are keyed by message id
  const statusById = new Map(
    visible.filter((m) => !m.transaction).map((m) => [m.id, m.status] as const)
  )
  const rows = visible.map(
    (m) => m.transaction ?? toPlaceholderTransaction(m, pendingById.get(m.id)?.date ?? null)
  )

  // Only rows that are transactions can be selected (not messages waiting for review or dismissed)
  const selectableCount = visible.filter((m) => m.transaction).length

  const changeFilter = (next: Filter) => {
    setSelectedIds(new Set())
    setFilter(next)
  }

  const toggleSelectionMode = () => {
    setSelectedIds(new Set())
    setSelectionMode((on) => !on)
  }

  return (
    <div className={cn('space-y-3', selectedIds.size > 0 && 'pb-24')}>
      <div
        className={cn(
          'flex flex-wrap items-center gap-3 p-4 rounded-2xl',
          'bg-linear-to-b from-card to-card/80',
          'border border-border-subtle',
          'shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]',
          'dark:shadow-[0_1px_3px_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.15)]'
        )}
      >
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search messages"
            data-page-search
            placeholder="Search by sender or merchant..."
            value={search}
            onChange={(e) => {
              setSelectedIds(new Set())
              setSearch(e.target.value)
            }}
            className="h-11 rounded-xl border-border-subtle bg-surface-elevated pl-10 pr-10 placeholder:text-muted-foreground/60"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 transition-colors hover:bg-surface-hover"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <SegmentedControl
          aria-label="Filter messages"
          className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          value={filter}
          onChange={changeFilter}
          options={[
            { value: 'all', label: `All (${messages.length})` },
            { value: 'imported', label: `Imported (${count('imported')})` },
            { value: 'verified', label: `Verified (${count('verified')})` },
            { value: 'needs_review', label: `Needs review (${count('needs_review')})` },
            { value: 'dismissed', label: `Dismissed (${count('dismissed')})` },
          ]}
        />
      </div>

      {(selectableCount > 0 || lastSyncAt) && (
        <div className="flex flex-wrap items-center gap-3">
          {selectableCount > 0 && (
            <button
              type="button"
              aria-pressed={selectionMode}
              onClick={toggleSelectionMode}
              className={cn(
                'flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium border transition-all duration-200',
                selectionMode
                  ? 'bg-surface-hover border-border-hover text-muted-foreground hover:text-foreground'
                  : 'bg-surface-elevated border-border-subtle text-muted-foreground hover:text-foreground hover:border-border-hover'
              )}
            >
              {selectionMode ? (
                <X className="h-3.5 w-3.5" />
              ) : (
                <ListChecks className="h-3.5 w-3.5" />
              )}
              <span>{selectionMode ? 'Cancel' : 'Select'}</span>
            </button>
          )}
          {lastSyncAt && (
            <p className="ml-auto text-xs text-muted-foreground">
              Last synced {new Date(lastSyncAt).toLocaleTimeString()}
            </p>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="No messages here"
          description={
            messages.length === 0
              ? 'Press Sync to read your bank messages, or sync from an earlier date in Settings.'
              : 'No messages match your search or filter.'
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
            const dismissed = visible.find((m) => m.id === txn.id && m.status === 'dismissed')
            if (waiting) setReviewing(waiting)
            else if (dismissed) setRestoring(dismissed)
            else setEditing(txn)
          }}
          isSelectable={(txn) => !statusById.has(txn.id)}
          selectedIds={selectionMode ? selectedIds : undefined}
          onSelectionChange={selectionMode ? setSelectedIds : undefined}
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

      <p className="pt-2 text-center text-xs text-muted-foreground">
        Showing transactions synced in the last 14 days.
      </p>

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
              onCancel={() => setReviewing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!restoring} onOpenChange={(open) => !open && setRestoring(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dismissed message</DialogTitle>
            <DialogDescription>
              {restoring?.sender} · {restoring && new Date(restoring.receivedAt).toLocaleString()}
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

      <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {selectedIds.size} Transactions</DialogTitle>
            <DialogDescription>
              Only the fields you change are applied to every selected transaction.
            </DialogDescription>
          </DialogHeader>
          <TransactionEditForm
            transactionIds={[...selectedIds]}
            categories={categories}
            onClose={() => setBulkEditOpen(false)}
            onSuccess={() => {
              setBulkEditOpen(false)
              setSelectedIds(new Set())
            }}
          />
        </DialogContent>
      </Dialog>

      {selectedIds.size > 0 && (
        <BulkActionBar
          selectedIds={selectedIds}
          totalMatching={selectableCount}
          filtered={filter !== 'all' || !!query}
          pageFullySelected={false}
          categories={categories}
          showingHidden={false}
          selectingAll={false}
          onSelectAllMatching={() => {}}
          onEdit={() => setBulkEditOpen(true)}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      <EditTransactionDialog
        transaction={editing}
        categories={categories}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}
