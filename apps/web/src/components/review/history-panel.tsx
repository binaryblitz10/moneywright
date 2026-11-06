import { useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  ArrowRight,
  CalendarCheck,
  CopyCheck,
  Check,
  ChevronDown,
  GitMerge,
  History,
  Link2,
  Undo2,
  Wand2,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { formatShortDate } from '@/lib/date-presets'
import {
  describeUndo,
  useAutoFixBatches,
  useDismissDuplicates,
  useDuplicateGroups,
  useMergedDuplicates,
  useUndoChange,
  useUnmergeDuplicate,
} from '@/hooks'
import { AccountAvatar } from '@/components/transactions/transaction-table'
import { CategoryIcon } from '@/components/ui/category-icon'
import { formatFileSize, formatPeriod, getAccountShortLabel } from '@/lib/statement-display'
import { StatementCard } from '@/components/statements/statement-card'
import { getCategoryColorClasses } from '@/lib/category-colors'
import type { Account, Category } from '@/lib/api'
import { useHistoryUiState } from './history-state'
import type { ReviewPanelProps } from './types'

interface FeedItem {
  id: string
  /** ISO timestamp the feed is sorted and grouped by, newest first */
  at: string
  icon: LucideIcon
  title: ReactNode
  /** Small marker after the title, e.g. that auto-fix did this */
  chip?: ReactNode
  detail: string
  action: ReactNode
  /** What the row opens to show */
  expanded: ReactNode
}

interface FeedGroup {
  label: string
  items: FeedItem[]
}

const DAY_MS = 86_400_000

/** "This week", "This month", else the month name: the first two always show, months load on demand */
function groupLabel(iso: string, now: Date): string {
  const date = new Date(iso)
  if (now.getTime() - date.getTime() < 7 * DAY_MS) return 'This week'
  if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) {
    return 'This month'
  }
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

interface TxnCardProps {
  accounts: Account[]
  categories: Category[]
  countryCode: string
  accountId: string
  date: string
  name: string
  description?: string | null
  amount: string
  type: string
  category: string
  smsSource: boolean
  /** Opens the transaction popup */
  onOpen: () => void
  /** 'keep' rings the card like the kept transaction in Duplicates; 'merged' marks the merged copy */
  badge?: 'keep' | 'merged'
}

/** A transaction card styled like the ones in Duplicates, but compact */
function TxnCard({
  accounts,
  categories,
  countryCode,
  accountId,
  date,
  name,
  description,
  amount,
  type,
  category,
  smsSource,
  onOpen,
  badge,
}: TxnCardProps) {
  const account = accounts.find((a) => a.id === accountId)
  const categoryInfo = categories.find((c) => c.code === category)
  const colors = getCategoryColorClasses(categoryInfo?.color ?? 'zinc')
  // Every card shows its category, even one the list doesn't know (named from its code)
  const fallbackLabel = category.replace(/_/g, ' ')
  const categoryLabel =
    categoryInfo?.label ?? fallbackLabel.charAt(0).toUpperCase() + fallbackLabel.slice(1)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        'min-w-0 cursor-pointer space-y-3 rounded-xl border p-4 transition-colors hover:border-foreground/30',
        badge === 'keep'
          ? 'border-primary/60 bg-primary/[0.04]'
          : 'border-border-subtle bg-surface-elevated'
      )}
    >
      <div className="flex items-center gap-3">
        <AccountAvatar
          logoPath={
            account?.institution ? `/institutions/${countryCode}/${account.institution}.svg` : null
          }
          institutionId={account?.institution || 'other'}
          isCard={account?.type === 'credit_card'}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {account ? getAccountShortLabel(account) : 'Account'}
          </p>
          <p className="text-xs text-muted-foreground">{formatShortDate(date)}</p>
        </div>
        {badge === 'keep' && (
          <span className="flex items-center gap-1.5 rounded-full bg-primary/10 py-0.5 pl-0.5 pr-2.5 text-xs font-medium text-primary">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
            Keep
          </span>
        )}
        {badge === 'merged' && (
          <span className="flex items-center gap-1.5 rounded-full bg-muted py-0.5 pl-2 pr-2.5 text-xs font-medium text-muted-foreground">
            <GitMerge className="h-3 w-3" />
            Merged
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={name}>
            {name}
          </p>
          {description && description !== name && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <p
          className={cn(
            'shrink-0 text-lg font-semibold tracking-tight tabular-nums',
            type === 'credit' && 'text-positive'
          )}
        >
          {type === 'credit' ? '+' : '-'}
          {amount}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
            colors.bg,
            colors.text
          )}
        >
          <CategoryIcon code={category} className="h-3.5 w-3.5" />
          {categoryLabel}
        </span>
        <p className="shrink-0 text-xs text-muted-foreground">
          {smsSource ? 'Bank message' : 'Statement'}
        </p>
      </div>
    </div>
  )
}

/** Merges: shown through the merged list, not as rows of their own */
const MERGE_FIXERS = new Set(['duplicates-sure', 'duplicates-likely', 'bank-message-ref'])

/** How each transaction fixer reads in the feed */
const FIX_KINDS: Record<string, { verb: string; icon: LucideIcon }> = {
  'card-payment-unique': { verb: 'Linked card payment', icon: Link2 },
  'transfer-pairs': { verb: 'Linked transfer', icon: Link2 },
  'broken-links': { verb: 'Repaired link on', icon: Link2 },
}

/** Sort for a pair of linked transactions: the money-out side first */
function debitFirst(a: { type: string }, b: { type: string }): number {
  return a.type === b.type ? 0 : a.type === 'debit' ? -1 : 1
}

function AutoFixedChip() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
      <Wand2 className="h-3 w-3" />
      Auto
    </span>
  )
}

function ExpandedPanel({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-border-subtle bg-muted/30 p-3">{children}</div>
}

function FeedRow({
  item,
  open,
  onOpenChange,
}: {
  item: FeedItem
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  // Built on first open (then kept mounted so closing animates): most rows are never opened
  const [opened, setOpened] = useState(open)
  const Icon = item.icon
  const toggle = (next: boolean) => {
    onOpenChange(next)
    if (next) setOpened(true)
  }
  return (
    <Collapsible open={open} onOpenChange={toggle}>
      {/* The whole row toggles; the trigger stays a real button for the keyboard */}
      <div className="flex cursor-pointer items-center gap-3 p-4" onClick={() => toggle(!open)}>
        <CollapsibleTrigger
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
          onClick={(event) => event.stopPropagation()}
        >
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm">{item.title}</p>
              {item.chip}
            </div>
            <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180'
            )}
          />
        </CollapsibleTrigger>
        <div className="cursor-default" onClick={(event) => event.stopPropagation()}>
          {item.action}
        </div>
      </div>
      <CollapsibleContent className="px-4 pb-4 pl-11">{opened && item.expanded}</CollapsibleContent>
    </Collapsible>
  )
}

export function HistoryPanel({
  filters,
  accounts,
  categories,
  countryCode,
  formatAmount,
  onEditTransaction,
}: ReviewPanelProps) {
  const { extraMonths, openIds, showMore, setOpen } = useHistoryUiState()
  const { data: dismissedGroups = [] } = useDuplicateGroups({ ...filters, dismissed: true })
  const { data: mergedItems = [] } = useMergedDuplicates(filters.profileId)
  const { data: batches = [] } = useAutoFixBatches(filters.profileId)
  const dismissMutation = useDismissDuplicates()
  const unmergeMutation = useUnmergeDuplicate()
  const undoChange = useUndoChange()

  const groups = useMemo<FeedGroup[]>(() => {
    const feed: FeedItem[] = []
    const cardContext = { accounts, categories, countryCode }
    const onResult = (result: { undone: number; skipped: number }) =>
      toast.success(describeUndo(result))
    const onError = () => toast.error('Could not undo')

    for (const { transaction: copy, keeper } of mergedItems) {
      feed.push({
        id: `merged-${copy.id}`,
        at: copy.updatedAt,
        icon: GitMerge,
        title: (
          <>
            Merged duplicate <strong>{copy.summary || copy.originalDescription}</strong>
          </>
        ),
        detail: `${formatShortDate(copy.date)} · ${formatAmount(copy.amount, copy.currency)}`,
        action: (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={unmergeMutation.isPending}
            onClick={() => unmergeMutation.mutate(copy.id)}
          >
            <Undo2 className="mr-2 h-3.5 w-3.5" />
            Undo
          </Button>
        ),
        expanded: (
          <ExpandedPanel>
            <div className="relative grid items-center gap-5 sm:grid-cols-2">
              <TxnCard
                {...cardContext}
                badge="merged"
                accountId={copy.accountId}
                date={copy.date}
                name={copy.summary || copy.originalDescription}
                description={copy.originalDescription}
                amount={formatAmount(copy.amount, copy.currency)}
                type={copy.type}
                category={copy.category}
                smsSource={copy.smsSource}
                onOpen={() => onEditTransaction(copy)}
              />
              <ArrowRight className="mx-auto h-4 w-4 rotate-90 text-muted-foreground sm:absolute sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rotate-0" />
              {keeper ? (
                <TxnCard
                  {...cardContext}
                  badge="keep"
                  accountId={keeper.accountId}
                  date={keeper.date}
                  name={keeper.summary || keeper.originalDescription || 'Transaction'}
                  description={keeper.originalDescription}
                  amount={formatAmount(keeper.amount, keeper.currency)}
                  type={keeper.type}
                  category={keeper.category}
                  smsSource={keeper.smsSource}
                  onOpen={() => onEditTransaction(keeper)}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  The transaction it was merged into no longer exists
                </p>
              )}
            </div>
          </ExpandedPanel>
        ),
      })
    }

    for (const group of dismissedGroups) {
      const first = group.transactions[0]
      if (!first) continue
      feed.push({
        id: `kept-${group.signature}`,
        at: first.updatedAt,
        icon: CopyCheck,
        title: (
          <>
            Kept both <strong>{first.summary || first.originalDescription}</strong>
          </>
        ),
        detail: `${formatShortDate(first.date)} · ${formatAmount(first.amount, first.currency)} · ${group.transactions.length} transactions`,
        action: (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={dismissMutation.isPending}
            onClick={() =>
              dismissMutation.mutate({ signatures: [group.signature], dismissed: false })
            }
          >
            <Undo2 className="mr-2 h-3.5 w-3.5" />
            Undo
          </Button>
        ),
        expanded: (
          <ExpandedPanel>
            <div className="grid gap-5 sm:grid-cols-2">
              {group.transactions.map((t) => (
                <TxnCard
                  key={t.id}
                  {...cardContext}
                  accountId={t.accountId}
                  date={t.date}
                  name={t.summary || t.originalDescription}
                  description={t.originalDescription}
                  amount={formatAmount(t.amount, t.currency)}
                  type={t.type}
                  category={t.category}
                  smsSource={t.smsSource}
                  onOpen={() => onEditTransaction(t)}
                />
              ))}
            </div>
          </ExpandedPanel>
        ),
      })
    }

    // Merges made by auto-fix show as the merged rows above, marked with the chip
    const autoMergedIds = new Set<string>()
    for (const batch of batches) {
      for (const change of batch.changes) {
        if (!change.undoneAt && MERGE_FIXERS.has(change.fixer)) autoMergedIds.add(change.entityId)
      }
    }
    for (const item of feed) {
      if (autoMergedIds.has(item.id.replace(/^merged-/, ''))) item.chip = <AutoFixedChip />
    }

    const handled = new Set<string>()
    for (const batch of batches) {
      for (const change of batch.changes) {
        if (handled.has(change.id) || change.undoneAt || MERGE_FIXERS.has(change.fixer)) continue
        const kind = FIX_KINDS[change.fixer]
        const undoFor = (ids: string[]) => (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={undoChange.isPending}
            onClick={async () => {
              const total = { undone: 0, skipped: 0 }
              try {
                for (const id of ids) {
                  const result = await undoChange.mutateAsync(id)
                  total.undone += result.undone
                  total.skipped += result.skipped
                }
                onResult(total)
              } catch {
                onError()
              }
            }}
          >
            <Undo2 className="mr-2 h-3.5 w-3.5" />
            Undo
          </Button>
        )

        if (change.entityType === 'statement') {
          const statement = change.statement
          if (!statement) continue
          const account = accounts.find((a) => a.id === statement.accountId)
          const period = change.after as { periodStart?: string; periodEnd?: string } | null
          feed.push({
            id: `fix-${change.id}`,
            at: batch.createdAt,
            icon: CalendarCheck,
            chip: <AutoFixedChip />,
            title: <>Filled in statement dates</>,
            detail:
              period?.periodStart && period.periodEnd
                ? `${/^Set the dates of (.+?) to /.exec(change.description)?.[1] ?? 'Statement'} · ${formatShortDate(period.periodStart)} to ${formatShortDate(period.periodEnd)}`
                : change.description,
            action: undoFor([change.id]),
            expanded: (
              <ExpandedPanel>
                {/* Same width as the transaction cards */}
                <div className="grid gap-5 sm:grid-cols-2">
                  <StatementCard
                    statement={statement}
                    account={account}
                    source={undefined}
                    logoPath={
                      account?.institution
                        ? `/institutions/${countryCode}/${account.institution}.svg`
                        : null
                    }
                    formatFileSize={formatFileSize}
                    formatPeriod={formatPeriod}
                  />
                </div>
              </ExpandedPanel>
            ),
          })
          continue
        }

        const txn = change.transaction
        if (change.entityType !== 'transaction' || !txn || !kind) continue
        // A link changes both sides: show the two transactions together in one row
        const partner = batch.changes.find(
          (other) =>
            other.id !== change.id &&
            other.fixer === change.fixer &&
            !other.undoneAt &&
            !handled.has(other.id) &&
            other.entityId === txn.linkedEntityId &&
            other.transaction
        )
        if (partner) handled.add(partner.id)
        const cards = [txn, partner?.transaction].filter((t) => !!t).sort(debitFirst)
        const name = txn.summary || txn.originalDescription
        feed.push({
          id: `fix-${change.id}`,
          at: batch.createdAt,
          icon: kind.icon,
          chip: <AutoFixedChip />,
          title: partner ? (
            <>
              {kind.verb} <strong>{formatAmount(txn.amount, txn.currency)}</strong>
            </>
          ) : (
            <>
              {kind.verb} <strong>{name}</strong>
            </>
          ),
          detail: partner
            ? `${formatShortDate(txn.date)} · ${cards.map((t) => t.summary || t.originalDescription).join(' and ')}`
            : `${formatShortDate(txn.date)} · ${formatAmount(txn.amount, txn.currency)}`,
          action: undoFor(partner ? [change.id, partner.id] : [change.id]),
          expanded: (
            <ExpandedPanel>
              {/* Same width as the cards in a pair */}
              <div className="grid gap-5 sm:grid-cols-2">
                {cards.map((t) => (
                  <TxnCard
                    key={t.id}
                    {...cardContext}
                    accountId={t.accountId}
                    date={t.date}
                    name={t.summary || t.originalDescription}
                    description={t.originalDescription}
                    amount={formatAmount(t.amount, t.currency)}
                    type={t.type}
                    category={t.category}
                    smsSource={t.smsSource}
                    onOpen={() => onEditTransaction(t)}
                  />
                ))}
              </div>
            </ExpandedPanel>
          ),
        })
      }
    }

    feed.sort((a, b) => b.at.localeCompare(a.at))
    const now = new Date()
    const grouped: FeedGroup[] = []
    for (const item of feed) {
      const label = groupLabel(item.at, now)
      const last = grouped[grouped.length - 1]
      if (last?.label === label) last.items.push(item)
      else grouped.push({ label, items: [item] })
    }
    return grouped
  }, [
    mergedItems,
    dismissedGroups,
    batches,
    accounts,
    categories,
    countryCode,
    formatAmount,
    onEditTransaction,
    unmergeMutation,
    dismissMutation,
    undoChange,
  ])

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Nothing here yet"
        description="Merges, kept duplicates and automatic fixes show up here, and you can undo any of them."
      />
    )
  }

  const recent = groups.filter((g) => g.label === 'This week' || g.label === 'This month')
  const months = groups.filter((g) => g.label !== 'This week' && g.label !== 'This month')
  // With nothing recent, the newest older month shows by default so the tab is never blank
  const shownMonths = (recent.length === 0 ? 1 : 0) + extraMonths
  const visible = [...recent, ...months.slice(0, shownMonths)]
  const hidden = months.length - shownMonths

  return (
    <div className="space-y-6">
      {visible.map((group) => (
        <div key={group.label} className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {group.label}
          </p>
          <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-card">
            {group.items.map((item) => (
              <FeedRow
                key={item.id}
                item={item}
                open={openIds.includes(item.id)}
                onOpenChange={(open) => setOpen(item.id, open)}
              />
            ))}
          </div>
        </div>
      ))}
      {hidden > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={showMore}>
            Show more
          </Button>
        </div>
      )}
    </div>
  )
}
