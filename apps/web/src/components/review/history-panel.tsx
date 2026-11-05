import { useState } from 'react'
import { CheckCheck, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { formatShortDate } from '@/lib/date-presets'
import {
  useDismissDuplicates,
  useDuplicateGroups,
  useMergedDuplicates,
  useUnmergeDuplicate,
} from '@/hooks'
import { AutoFixedPanel } from './auto-fixed-panel'
import { DuplicateGroupCards } from './duplicate-card'
import type { ReviewPanelProps } from './types'

export type HistorySegment = 'merged' | 'not-duplicates' | 'auto-fixed'

interface HistoryPanelProps extends ReviewPanelProps {
  /** Segment to show first, e.g. when arriving from an old Auto-fixed link */
  initialSegment?: HistorySegment
}

export function HistoryPanel({
  filters,
  formatAmount,
  initialSegment = 'merged',
  ...tableProps
}: HistoryPanelProps) {
  const [segment, setSegment] = useState<HistorySegment>(initialSegment)
  const { data: dismissedGroups = [] } = useDuplicateGroups({ ...filters, dismissed: true })
  const { data: mergedItems = [] } = useMergedDuplicates(filters.profileId)
  const dismissMutation = useDismissDuplicates()
  const unmergeMutation = useUnmergeDuplicate()

  return (
    <div className="space-y-4">
      <SegmentedControl
        aria-label="History"
        size="sm"
        value={segment}
        onChange={setSegment}
        options={[
          {
            value: 'merged',
            label: (
              <>
                Merged <span className="tabular-nums opacity-70">{mergedItems.length}</span>
              </>
            ),
          },
          {
            value: 'not-duplicates',
            label: (
              <>
                Not duplicates{' '}
                <span className="tabular-nums opacity-70">{dismissedGroups.length}</span>
              </>
            ),
          },
          { value: 'auto-fixed', label: 'Auto-fixed' },
        ]}
      />

      {segment === 'merged' &&
        (mergedItems.length === 0 ? (
          <EmptyState
            icon={CheckCheck}
            title="Nothing merged yet"
            description="Duplicates you merge show up here, and you can unmerge them."
          />
        ) : (
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
        ))}

      {segment === 'not-duplicates' &&
        (dismissedGroups.length === 0 ? (
          <EmptyState
            icon={CheckCheck}
            title="No groups set aside"
            description="Groups you mark as not duplicates show up here."
          />
        ) : (
          <div className="space-y-8">
            {dismissedGroups.map((group) => (
              <div key={group.key} className="space-y-3">
                <DuplicateGroupCards
                  group={group}
                  accounts={tableProps.accounts}
                  countryCode={tableProps.countryCode}
                  formatAmount={formatAmount}
                />
                <div className="flex justify-center">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={dismissMutation.isPending}
                    onClick={() =>
                      dismissMutation.mutate({ signatures: [group.signature], dismissed: false })
                    }
                  >
                    Mark as duplicates
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ))}

      {segment === 'auto-fixed' && <AutoFixedPanel profileId={filters.profileId} />}
    </div>
  )
}
