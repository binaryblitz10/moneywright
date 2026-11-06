import { useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Ban, ChevronDown, GitMerge, History, Undo2, Wand2, type LucideIcon } from 'lucide-react'
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
  useUndoBatch,
  useUndoChange,
  useUnmergeDuplicate,
} from '@/hooks'
import type { Account } from '@/lib/api'
import type { ReviewPanelProps } from './types'

interface FeedItem {
  id: string
  /** ISO timestamp the feed is sorted and grouped by, newest first */
  at: string
  icon: LucideIcon
  title: ReactNode
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

function accountLabel(accounts: Account[], accountId: string): string {
  const account = accounts.find((a) => a.id === accountId)
  return [account?.institution, account?.accountName].filter(Boolean).join(' ') || 'Account'
}

function DetailLine({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

function FeedRow({ item }: { item: FeedItem }) {
  const [open, setOpen] = useState(false)
  const Icon = item.icon
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-3 p-4">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="truncate text-sm">{item.title}</p>
            <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180'
            )}
          />
        </CollapsibleTrigger>
        {item.action}
      </div>
      <CollapsibleContent className="space-y-1 px-4 pb-4 pl-11">{item.expanded}</CollapsibleContent>
    </Collapsible>
  )
}

export function HistoryPanel({ filters, accounts, formatAmount }: ReviewPanelProps) {
  const { data: dismissedGroups = [] } = useDuplicateGroups({ ...filters, dismissed: true })
  const { data: mergedItems = [] } = useMergedDuplicates(filters.profileId)
  const { data: batches = [] } = useAutoFixBatches(filters.profileId)
  const dismissMutation = useDismissDuplicates()
  const unmergeMutation = useUnmergeDuplicate()
  const undoBatch = useUndoBatch()
  const undoChange = useUndoChange()
  const [extraMonths, setExtraMonths] = useState(0)

  const groups = useMemo<FeedGroup[]>(() => {
    const feed: FeedItem[] = []
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
            Unmerge
          </Button>
        ),
        expanded: (
          <>
            <DetailLine>
              Removed copy: {copy.originalDescription} · {accountLabel(accounts, copy.accountId)}
            </DetailLine>
            <DetailLine>
              {keeper
                ? `Kept: ${keeper.summary || keeper.originalDescription} · ${formatShortDate(keeper.date)} · ${formatAmount(keeper.amount, copy.currency)}`
                : 'The transaction it was merged into no longer exists'}
            </DetailLine>
          </>
        ),
      })
    }

    for (const group of dismissedGroups) {
      const first = group.transactions[0]
      if (!first) continue
      feed.push({
        id: `kept-${group.signature}`,
        at: first.updatedAt,
        icon: Ban,
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
            Review again
          </Button>
        ),
        expanded: (
          <>
            <DetailLine>You marked these as different transactions, not duplicates:</DetailLine>
            {group.transactions.map((t) => (
              <DetailLine key={t.id}>
                {t.summary || t.originalDescription} · {formatShortDate(t.date)} ·{' '}
                {formatAmount(t.amount, t.currency)} · {accountLabel(accounts, t.accountId)}
              </DetailLine>
            ))}
          </>
        ),
      })
    }

    for (const batch of batches) {
      const count = batch.changes.length
      feed.push({
        id: `fix-${batch.id}`,
        at: batch.createdAt,
        icon: Wand2,
        title: (
          <>
            Auto-fixed <strong>{count}</strong> {count === 1 ? 'thing' : 'things'}
          </>
        ),
        detail: batch.trigger === 'import' ? 'After an import' : 'Run by you',
        action: batch.undoneAt ? (
          <span className="text-xs text-muted-foreground">Undone</span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={undoBatch.isPending}
            onClick={() => undoBatch.mutate(batch.id, { onSuccess: onResult, onError })}
          >
            <Undo2 className="mr-2 h-3.5 w-3.5" />
            Undo all
          </Button>
        ),
        expanded: (
          <ul className="divide-y divide-border-subtle">
            {batch.changes.map((change) => (
              <li key={change.id} className="flex items-center gap-3 py-2">
                <p className="min-w-0 flex-1 text-sm">{change.description}</p>
                {change.undoneAt || batch.undoneAt ? (
                  <span className="text-xs text-muted-foreground">Undone</span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    disabled={undoChange.isPending}
                    onClick={() => undoChange.mutate(change.id, { onSuccess: onResult, onError })}
                  >
                    Undo
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ),
      })
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
    formatAmount,
    unmergeMutation,
    dismissMutation,
    undoBatch,
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
  const visible = [...recent, ...months.slice(0, extraMonths)]
  const hidden = months.length - extraMonths

  return (
    <div className="space-y-6">
      {visible.map((group) => (
        <div key={group.label} className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {group.label}
          </p>
          <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-card">
            {group.items.map((item) => (
              <FeedRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      ))}
      {hidden > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setExtraMonths((n) => n + 1)}>
            Show more
          </Button>
        </div>
      )}
    </div>
  )
}
