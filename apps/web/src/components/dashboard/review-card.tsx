import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { EditTransactionDialog } from '@/components/transactions'
import { CategorizationPanel, DuplicatesPanel } from '@/components/review'
import { Button } from '@/components/ui/button'
import { SectionCard } from '@/components/ui/section-card'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { cn } from '@/lib/utils'
import {
  useAccounts,
  useAuth,
  useAutoFixBatches,
  useDataHealth,
  usePreferences,
  useReviewCounts,
} from '@/hooks'
import { countOpenDataIssues } from '@/components/settings'
import { ReviewHealth } from './review-health'
import { PREFERENCE_KEYS, type Category, type Transaction } from '@/lib/api'

type ReviewTab = 'duplicates' | 'categorization'

interface ReviewCardProps {
  /** Undefined in family view, which reviews everyone's transactions */
  profileId: string | undefined
  enabled: boolean
  categories: Category[]
  countryCode: string
  className?: string
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** The Review page's Duplicates and Categories tabs, settled from the dashboard */
export function ReviewCard({
  profileId,
  enabled,
  categories,
  countryCode,
  className,
}: ReviewCardProps) {
  const [chosenTab, setChosenTab] = useState<ReviewTab | null>(null)
  const [editing, setEditing] = useState<Transaction | null>(null)

  const { profiles } = useAuth()
  const { data: counts } = useReviewCounts(profileId)
  const { data: accounts } = useAccounts(profileId, { enabled })
  const { data: health } = useDataHealth(profileId, { enabled })
  const { data: preferences } = usePreferences()
  const { data: batches } = useAutoFixBatches(profileId, enabled)
  const [mountedAt] = useState(() => Date.now())

  const duplicatesCount = counts ? counts.duplicateGroups + counts.possibleMatches : 0
  const categorizationCount = counts ? counts.pending + counts.other + counts.lowConfidence : 0
  // Start on the tab that has something in it, until one is picked
  const tab: ReviewTab =
    chosenTab ??
    (duplicatesCount === 0 && categorizationCount > 0 ? 'categorization' : 'duplicates')
  // Checks ignored in Settings stay out; the shaky-category check is already part of Categories
  const dataIssues = health
    ? countOpenDataIssues(health, preferences?.[PREFERENCE_KEYS.DATA_HEALTH_IGNORED_CHECKS])
    : 0
  const autoFixed = useMemo(() => {
    const weekAgo = mountedAt - 7 * 24 * 60 * 60 * 1000
    return (batches ?? [])
      .filter((b) => !b.undoneAt && new Date(b.createdAt).getTime() >= weekAgo)
      .reduce((sum, b) => sum + b.changes.filter((c) => !c.undoneAt).length, 0)
  }, [batches, mountedAt])
  const toReview = duplicatesCount + categorizationCount

  const panelProps = {
    filters: { profileId, enabled },
    accounts: accounts ?? [],
    categories,
    countryCode,
    profiles,
    showProfileBadge: profileId === undefined,
    onEditTransaction: setEditing,
    getCategoryLabel: (code: string) =>
      categories.find((c) => c.code === code)?.label ?? code.replace(/_/g, ' '),
    formatAmount,
    compact: true,
  }

  return (
    <SectionCard
      title="Review"
      description={
        toReview > 0 ? `${toReview} ${toReview === 1 ? 'item' : 'items'}` : 'Nothing to review'
      }
      className={cn('gap-2', className)}
      contentClassName="space-y-5"
      action={
        <Link
          to="/review"
          search={{ tab: tab === 'categorization' ? 'categorization' : undefined }}
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            View all
            <ChevronRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
      }
    >
      <SegmentedControl
        aria-label="Review tab"
        size="sm"
        value={tab}
        onChange={setChosenTab}
        options={[
          {
            value: 'duplicates',
            label: (
              <>
                Duplicates <span className="tabular-nums opacity-70">{duplicatesCount}</span>
              </>
            ),
          },
          {
            value: 'categorization',
            label: (
              <>
                Categories <span className="tabular-nums opacity-70">{categorizationCount}</span>
              </>
            ),
          },
        ]}
      />

      {tab === 'duplicates' ? (
        <DuplicatesPanel {...panelProps} />
      ) : (
        <CategorizationPanel {...panelProps} />
      )}

      <div className="border-t border-border-subtle pt-4">
        <ReviewHealth dataIssues={dataIssues} autoFixed={autoFixed} />
      </div>

      <EditTransactionDialog
        transaction={editing}
        categories={categories}
        onClose={() => setEditing(null)}
      />
    </SectionCard>
  )
}
