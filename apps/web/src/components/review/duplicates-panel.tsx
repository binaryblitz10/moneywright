import { useState } from 'react'
import { toast } from 'sonner'
import { CheckCheck, ChevronLeft, ChevronRight, GitMerge } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { QueryError } from '@/components/ui/query-error'
import { TableSkeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useDismissDuplicates, useDuplicateGroups, useMergeDuplicates } from '@/hooks'
import { DuplicateGroupCards } from './duplicate-card'
import { ReviewActionButton } from './review-action-button'
import type { DuplicateGroup } from '@/lib/api'
import type { ReviewPanelProps } from './types'

/** Merge animation: copies glide into the kept card, then it confirms, then the merge is sent */
const MERGE_SLIDE_MS = 450
const MERGE_CONFIRM_MS = 800

export function DuplicatesPanel({ filters, formatAmount, ...tableProps }: ReviewPanelProps) {
  const {
    data: groups = [],
    isLoading,
    isPlaceholderData,
    isError,
    error,
    refetch,
  } = useDuplicateGroups(filters)
  const dismissMutation = useDismissDuplicates()
  const mergeMutation = useMergeDuplicates()
  const [index, setIndex] = useState(0)
  // Keepers chosen over the suggested one
  const [keeperOverride, setKeeperOverride] = useState<Record<string, string>>({})
  const [merge, setMerge] = useState<{ key: string; stage: 'slide' | 'done' } | null>(null)

  // The group that goes away after a merge or dismiss is replaced by the next one
  const currentIndex = Math.min(index, Math.max(groups.length - 1, 0))
  const current = groups[currentIndex]

  const busy = mergeMutation.isPending || merge !== null

  const keeperOf = (group: DuplicateGroup): string =>
    group.kind === 'duplicate' &&
    keeperOverride[group.key] &&
    group.transactions.some((t) => t.id === keeperOverride[group.key])
      ? keeperOverride[group.key]!
      : group.suggestedKeeperId
  const copiesOf = (group: DuplicateGroup): string[] => {
    // A match merges only its bank message / hand-entered transaction into the statement line
    if (group.kind === 'match') return group.provisionalId ? [group.provisionalId] : []
    const keeperId = keeperOf(group)
    return group.transactions.filter((t) => t.id !== keeperId).map((t) => t.id)
  }

  const makeKeeper = (group: DuplicateGroup, id: string) => {
    setKeeperOverride((prev) => ({ ...prev, [group.key]: id }))
  }

  const handleMerge = (group: DuplicateGroup) => {
    const ids = copiesOf(group)
    if (ids.length === 0) return
    setMerge({ key: group.key, stage: 'slide' })
    window.setTimeout(() => setMerge({ key: group.key, stage: 'done' }), MERGE_SLIDE_MS)
    // Let the animation finish before the group leaves the queue
    window.setTimeout(() => {
      mergeMutation.mutate(
        { keeperId: keeperOf(group), ids },
        {
          onSettled: () => setMerge(null),
          onSuccess: () =>
            toast.success(`Merged ${ids.length} duplicate${ids.length === 1 ? '' : 's'}`),
          onError: () => toast.error('Failed to merge duplicates'),
        }
      )
    }, MERGE_SLIDE_MS + MERGE_CONFIRM_MS)
  }

  const handleDismiss = (signature: string, dismissed: boolean) => {
    dismissMutation.mutate({ signatures: [signature], dismissed })
  }

  const renderGroup = (group: DuplicateGroup) => (
    <DuplicateGroupCards
      key={group.key}
      group={group}
      keeperId={keeperOf(group)}
      accounts={tableProps.accounts}
      categories={tableProps.categories}
      countryCode={tableProps.countryCode}
      formatAmount={formatAmount}
      onMakeKeeper={(id) => makeKeeper(group, id)}
      mergeStage={merge?.key === group.key ? merge.stage : undefined}
    />
  )

  if (isError) return <QueryError error={error} onRetry={() => void refetch()} />

  if (isLoading) return <TableSkeleton rows={6} columns={4} />

  if (groups.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={CheckCheck}
          title="No Duplicate Transactions"
          size="sm"
          glow
          className="flex min-h-[18.5rem] flex-col items-center justify-center"
        />
      </div>
    )
  }

  return (
    <div className="space-y-4 pt-8">
      {current && (
        <div
          key={current.key}
          className={cn('min-h-[18.5rem] animate-fade-in', isPlaceholderData && 'opacity-60')}
        >
          {renderGroup(current)}
        </div>
      )}

      {current && (
        <div className="flex flex-col items-center gap-5 pt-2">
          <div className="flex flex-col items-center gap-3">
            <ReviewActionButton
              icon={GitMerge}
              loading={mergeMutation.isPending || merge !== null}
              label="Merge"
              disabled={busy}
              onClick={() => handleMerge(current)}
            />
            <button
              type="button"
              disabled={dismissMutation.isPending || merge !== null}
              onClick={() => handleDismiss(current.signature, true)}
              className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
            >
              Not duplicate
            </button>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              aria-label="Previous group"
              disabled={currentIndex === 0}
              onClick={() => setIndex(currentIndex - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-1 text-sm text-muted-foreground">
              {currentIndex + 1} of {groups.length}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              aria-label="Next group"
              disabled={currentIndex >= groups.length - 1}
              onClick={() => setIndex(currentIndex + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
