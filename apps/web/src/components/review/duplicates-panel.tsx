import { useState } from 'react'
import { toast } from 'sonner'
import {
  CheckCheck,
  ChevronRight,
  EyeOff,
  GitMerge,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Undo2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { EmptyState } from '@/components/ui/empty-state'
import { QueryError } from '@/components/ui/query-error'
import { TableSkeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatShortDate } from '@/lib/date-presets'
import {
  useBulkDeleteTransactions,
  useBulkUpdateTransactions,
  useDismissDuplicates,
  useDuplicateGroups,
  useMergedDuplicates,
  useMergeDuplicates,
  useUnmergeDuplicate,
} from '@/hooks'
import { Pagination } from '@/components/transactions/pagination'
import { TransactionTable } from '@/components/transactions/transaction-table'
import type { DuplicateGroup, Transaction } from '@/lib/api'
import type { ReviewPanelProps } from './types'

const GROUPS_PER_PAGE = 10

export function DuplicatesPanel({ filters, formatAmount, ...tableProps }: ReviewPanelProps) {
  const {
    data: groups = [],
    isLoading,
    isPlaceholderData,
    isError,
    error,
    refetch,
  } = useDuplicateGroups(filters)
  const { data: dismissedGroups = [] } = useDuplicateGroups({ ...filters, dismissed: true })
  const dismissMutation = useDismissDuplicates()
  const deleteMutation = useBulkDeleteTransactions()
  const hideMutation = useBulkUpdateTransactions()
  const mergeMutation = useMergeDuplicates()
  const unmergeMutation = useUnmergeDuplicate()
  const { data: mergedItems = [] } = useMergedDuplicates(filters.profileId)
  const [page, setPage] = useState(1)
  // Copies the user took off the merge list, and keepers chosen over the suggested one
  const [deselected, setDeselected] = useState<Set<string>>(new Set())
  const [keeperOverride, setKeeperOverride] = useState<Record<string, string>>({})
  const [mergingAll, setMergingAll] = useState(false)
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[] | null>(null)

  const totalPages = Math.ceil(groups.length / GROUPS_PER_PAGE)
  const currentPage = Math.min(page, Math.max(totalPages, 1))
  const visibleGroups = groups.slice(
    (currentPage - 1) * GROUPS_PER_PAGE,
    currentPage * GROUPS_PER_PAGE
  )

  const busy =
    deleteMutation.isPending || hideMutation.isPending || mergeMutation.isPending || mergingAll

  const keeperOf = (group: DuplicateGroup): string =>
    keeperOverride[group.key] && group.transactions.some((t) => t.id === keeperOverride[group.key])
      ? keeperOverride[group.key]!
      : group.suggestedKeeperId
  const copiesOf = (group: DuplicateGroup): string[] => {
    const keeperId = keeperOf(group)
    return group.transactions
      .filter((t) => t.id !== keeperId && !deselected.has(t.id))
      .map((t) => t.id)
  }

  const selectedIds = new Set(visibleGroups.flatMap(copiesOf))

  const handleSelectionChange = (next: Set<string>) => {
    const updated = new Set(deselected)
    for (const group of visibleGroups) {
      const keeperId = keeperOf(group)
      for (const txn of group.transactions) {
        if (txn.id === keeperId) continue
        if (next.has(txn.id)) updated.delete(txn.id)
        else updated.add(txn.id)
      }
    }
    setDeselected(updated)
  }

  const makeKeeper = (group: DuplicateGroup, id: string) => {
    setKeeperOverride((prev) => ({ ...prev, [group.key]: id }))
    setDeselected((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const handleMerge = (group: DuplicateGroup) => {
    const ids = copiesOf(group)
    if (ids.length === 0) return
    mergeMutation.mutate(
      { keeperId: keeperOf(group), ids },
      {
        onSuccess: () =>
          toast.success(`Merged ${ids.length} duplicate${ids.length === 1 ? '' : 's'}`),
        onError: () => toast.error('Failed to merge duplicates'),
      }
    )
  }

  const sureGroups = groups.filter((g) => g.tier === 'sure' && copiesOf(g).length > 0)

  const handleMergeAllSure = async () => {
    setMergingAll(true)
    let merged = 0
    let failed = 0
    for (const group of sureGroups) {
      try {
        await mergeMutation.mutateAsync({ keeperId: keeperOf(group), ids: copiesOf(group) })
        merged += 1
      } catch {
        failed += 1
      }
    }
    setMergingAll(false)
    if (merged > 0) toast.success(`Merged ${merged} group${merged === 1 ? '' : 's'}`)
    if (failed > 0) toast.error(`Failed to merge ${failed} group${failed === 1 ? '' : 's'}`)
  }

  const handleDelete = () => {
    if (confirmDeleteIds) deleteMutation.mutate(confirmDeleteIds)
    setConfirmDeleteIds(null)
  }

  const handleDismiss = (signature: string, dismissed: boolean) => {
    dismissMutation.mutate({ signatures: [signature], dismissed })
  }

  const handleHide = (ids: string[]) => {
    hideMutation.mutate({ transactionIds: ids, isHidden: true })
  }

  // Marks which row of a group is kept, and lets the user pick a different one
  const keeperBadge = (txn: Transaction) => {
    const group = visibleGroups.find((g) => g.transactions.some((t) => t.id === txn.id))
    if (!group) return null
    if (keeperOf(group) === txn.id) {
      return (
        <Badge variant="outline" className="border-primary/40 text-primary">
          Keep
        </Badge>
      )
    }
    return (
      <button
        type="button"
        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        onClick={() => makeKeeper(group, txn.id)}
      >
        Keep this one
      </button>
    )
  }

  // One heading row per group, shown above its first transaction
  const groupHeader = (list: DuplicateGroup[], dismissed: boolean) => (txn: Transaction) => {
    const group = list.find((g) => g.transactions[0]?.id === txn.id)
    if (!group) return null
    const copies = dismissed ? [] : copiesOf(group)
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {!dismissed && (
            <Badge variant={group.tier === 'sure' ? 'default' : 'secondary'}>
              {group.tier === 'sure' ? 'Sure' : 'Check'}
            </Badge>
          )}
          <span className="font-medium text-foreground">
            {group.transactions.length} transactions
          </span>
          <span>
            {formatAmount(group.transactions[0]!.amount, group.transactions[0]!.currency)}
          </span>
          {group.reasons.length > 0 && <span className="text-xs">{group.reasons.join(' · ')}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={dismissMutation.isPending}
            onClick={() => handleDismiss(group.signature, !dismissed)}
          >
            {dismissed ? (
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
            ) : (
              <ShieldCheck className="mr-2 h-3.5 w-3.5" />
            )}
            {dismissed ? 'Mark as duplicates' : 'Not a duplicate'}
          </Button>
          {!dismissed && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    disabled={busy || copies.length === 0}
                  >
                    <MoreHorizontal className="mr-1 h-3.5 w-3.5" />
                    More
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleHide(copies)}>
                    <EyeOff className="h-4 w-4" />
                    Hide selected
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setConfirmDeleteIds(copies)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete selected
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                className="h-7"
                disabled={busy || copies.length === 0}
                onClick={() => handleMerge(group)}
              >
                {mergeMutation.isPending && !mergingAll ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <GitMerge className="mr-2 h-3.5 w-3.5" />
                )}
                Merge
              </Button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (isError) return <QueryError error={error} onRetry={() => void refetch()} />

  if (isLoading) return <TableSkeleton rows={6} columns={4} />

  const dismissedSection = dismissedGroups.length > 0 && (
    <Collapsible className="group/dismissed">
      <CollapsibleTrigger
        className={cn(
          'w-full rounded-xl px-4 py-2 text-left transition-all duration-300',
          'bg-linear-to-b from-card to-card/80',
          'border border-border-subtle',
          'shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]',
          'dark:shadow-[0_1px_3px_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.15)]'
        )}
      >
        <div className="flex h-7 items-center gap-3 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]/dismissed:rotate-90" />
          <span>Marked as not duplicates</span>
          <span className="ml-auto text-xs">{dismissedGroups.length}</span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4">
        <TransactionTable
          transactions={dismissedGroups.flatMap((g) => g.transactions)}
          formatAmount={formatAmount}
          renderGroupHeader={groupHeader(dismissedGroups, true)}
          {...tableProps}
        />
      </CollapsibleContent>
    </Collapsible>
  )

  const mergedSection = mergedItems.length > 0 && (
    <Collapsible className="group/merged">
      <CollapsibleTrigger
        className={cn(
          'w-full rounded-xl px-4 py-2 text-left transition-all duration-300',
          'bg-linear-to-b from-card to-card/80',
          'border border-border-subtle',
          'shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]',
          'dark:shadow-[0_1px_3px_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.15)]'
        )}
      >
        <div className="flex h-7 items-center gap-3 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]/merged:rotate-90" />
          <span>Merged</span>
          <span className="ml-auto text-xs">{mergedItems.length}</span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4">
        <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-card">
          {mergedItems.map(({ transaction: copy, keeper }) => (
            <div key={copy.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-sm font-medium">
                  {copy.summary || copy.originalDescription}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatShortDate(copy.date)} · {formatAmount(copy.amount, copy.currency)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {keeper
                    ? `Merged into ${keeper.summary || keeper.originalDescription} · ${formatShortDate(keeper.date)}`
                    : 'Merged into a transaction that no longer exists'}
                </p>
              </div>
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
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )

  if (groups.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={CheckCheck}
          title="No duplicates found"
          description="No transactions share the same account, date, amount and description."
        />
        {mergedSection}
        {dismissedSection}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {sureGroups.length > 0 && (
        <div className="flex justify-end">
          <Button size="sm" disabled={busy} onClick={() => void handleMergeAllSure()}>
            {mergingAll ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <GitMerge className="mr-2 h-4 w-4" />
            )}
            Merge all sure ({sureGroups.length})
          </Button>
        </div>
      )}

      <div className={cn('transition-opacity duration-200', isPlaceholderData && 'opacity-60')}>
        <TransactionTable
          transactions={visibleGroups.flatMap((g) => g.transactions)}
          formatAmount={formatAmount}
          selectedIds={selectedIds}
          onSelectionChange={handleSelectionChange}
          renderGroupHeader={groupHeader(visibleGroups, false)}
          renderBadge={keeperBadge}
          isSelectable={(txn) =>
            selectedIds.has(txn.id) || !visibleGroups.some((g) => keeperOf(g) === txn.id)
          }
          {...tableProps}
        />
      </div>

      {totalPages > 1 && (
        <Pagination page={currentPage} totalPages={totalPages} onPageChange={setPage} />
      )}

      {mergedSection}

      {dismissedSection}

      <AlertDialog
        open={confirmDeleteIds !== null}
        onOpenChange={(open) => !open && setConfirmDeleteIds(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Permanently delete {confirmDeleteIds?.length ?? 0} transaction
              {confirmDeleteIds?.length === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This can't be undone. Use "Hide" to keep them out of your totals but recoverable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
