import { useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  ArrowRight,
  CopyCheck,
  Check,
  ChevronDown,
  GitMerge,
  History,
  Undo2,
  Wand2,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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
import { AccountAvatar } from '@/components/transactions/transaction-table'
import { CategoryIcon } from '@/components/ui/category-icon'
import { getAccountShortLabel } from '@/lib/statement-display'
import { getCategoryColorClasses } from '@/lib/category-colors'
import type { Account, Category } from '@/lib/api'
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
  badge,
}: TxnCardProps) {
  const account = accounts.find((a) => a.id === accountId)
  const categoryInfo = categories.find((c) => c.code === category)
  const colors = getCategoryColorClasses(categoryInfo?.color ?? 'zinc')
  return (
    <div
      className={cn(
        'min-w-0 space-y-3 rounded-xl border p-4',
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
        {categoryInfo && category !== 'other' ? (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
              colors.bg,
              colors.text
            )}
          >
            <CategoryIcon code={category} className="h-3.5 w-3.5" />
            {categoryInfo.label}
          </span>
        ) : (
          <span />
        )}
        <p className="shrink-0 text-xs text-muted-foreground">
          {smsSource ? 'Bank message' : 'Statement'}
        </p>
      </div>
    </div>
  )
}

/** "duplicates-sure" -> "Duplicate" for the chip on each fix */
const FIXER_LABELS: Record<string, string> = {
  'duplicates-sure': 'Duplicate',
  'duplicates-likely': 'Likely duplicate',
  'card-links': 'Card link',
  categorization: 'Category',
  'statement-periods': 'Statement period',
}

function fixerLabel(fixer: string): string {
  const text = FIXER_LABELS[fixer] ?? fixer.replace(/[-_]/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function ExpandedPanel({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-border-subtle bg-muted/30 p-3">{children}</div>
}

function FeedRow({ item }: { item: FeedItem }) {
  const [open, setOpen] = useState(false)
  // Built on first open (then kept mounted so closing animates): most rows are never opened
  const [opened, setOpened] = useState(false)
  const Icon = item.icon
  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setOpened(true)
      }}
    >
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
      <CollapsibleContent className="px-4 pb-4 pl-11">{opened && item.expanded}</CollapsibleContent>
    </Collapsible>
  )
}

interface HistoryPanelProps extends ReviewPanelProps {
  /** Months shown beyond This week / This month. Held by the Review page so it survives tab switches. */
  extraMonths: number
  onShowMore: () => void
}

export function HistoryPanel({
  filters,
  accounts,
  categories,
  countryCode,
  formatAmount,
  extraMonths,
  onShowMore,
}: HistoryPanelProps) {
  const { data: dismissedGroups = [] } = useDuplicateGroups({ ...filters, dismissed: true })
  const { data: mergedItems = [] } = useMergedDuplicates(filters.profileId)
  const { data: batches = [] } = useAutoFixBatches(filters.profileId)
  const dismissMutation = useDismissDuplicates()
  const unmergeMutation = useUnmergeDuplicate()
  const undoBatch = useUndoBatch()
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
            Unmerge
          </Button>
        ),
        expanded: (
          <ExpandedPanel>
            <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
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
              />
              <ArrowRight className="mx-auto h-4 w-4 rotate-90 text-muted-foreground sm:rotate-0" />
              {keeper ? (
                <TxnCard
                  {...cardContext}
                  badge="keep"
                  accountId={keeper.accountId}
                  date={keeper.date}
                  name={keeper.summary || keeper.originalDescription || 'Transaction'}
                  description={keeper.originalDescription}
                  amount={formatAmount(keeper.amount, copy.currency)}
                  type={copy.type}
                  category={copy.category}
                  smsSource={keeper.smsSource}
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
            Review again
          </Button>
        ),
        expanded: (
          <ExpandedPanel>
            <div className="grid gap-3 sm:grid-cols-2">
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
                />
              ))}
            </div>
          </ExpandedPanel>
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
          <ExpandedPanel>
            <ul className="divide-y divide-border-subtle">
              {batch.changes.map((change) => {
                const undone = !!change.undoneAt || !!batch.undoneAt
                return (
                  <li key={change.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                    <Badge variant="secondary" className="shrink-0 font-normal">
                      {fixerLabel(change.fixer)}
                    </Badge>
                    <p
                      className={cn(
                        'min-w-0 flex-1 text-sm',
                        undone && 'text-muted-foreground line-through'
                      )}
                    >
                      {change.description}
                    </p>
                    {undone ? (
                      <span className="text-xs text-muted-foreground">Undone</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        disabled={undoChange.isPending}
                        onClick={() =>
                          undoChange.mutate(change.id, { onSuccess: onResult, onError })
                        }
                      >
                        Undo
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </ExpandedPanel>
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
    categories,
    countryCode,
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
          <Button variant="outline" size="sm" onClick={onShowMore}>
            Show more
          </Button>
        </div>
      )}
    </div>
  )
}
