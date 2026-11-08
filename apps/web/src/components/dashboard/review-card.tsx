import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { EditTransactionDialog } from '@/components/transactions'
import { CategorizationPanel } from '@/components/review'
import { Button } from '@/components/ui/button'
import { SectionCard } from '@/components/ui/section-card'
import { cn } from '@/lib/utils'
import {
  useAccounts,
  useAuth,
  useAutoFixBatches,
  useDataHealth,
  usePreferences,
  useReviewCounts,
  getDuplicateReviewCount,
  getCategorizationReviewCount,
} from '@/hooks'
import { countOpenDataIssues } from '@/components/settings'
import { ReviewHealth } from './review-health'
import { PREFERENCE_KEYS, type Category, type Transaction } from '@/lib/api'

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

/** Transactions to categorize, settled from the dashboard, with links to duplicates and data issues */
export function ReviewCard({
  profileId,
  enabled,
  categories,
  countryCode,
  className,
}: ReviewCardProps) {
  const [editing, setEditing] = useState<Transaction | null>(null)

  const { profiles } = useAuth()
  const { data: counts } = useReviewCounts(profileId)
  const { data: accounts } = useAccounts(profileId, { enabled })
  const { data: health } = useDataHealth(profileId, { enabled })
  const { data: preferences } = usePreferences()
  const { data: batches } = useAutoFixBatches(profileId, enabled)
  const [mountedAt] = useState(() => Date.now())

  const duplicatesCount = counts ? getDuplicateReviewCount(counts) : 0
  const categorizationCount = counts ? getCategorizationReviewCount(counts) : 0
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
        categorizationCount > 0
          ? `${categorizationCount} ${categorizationCount === 1 ? 'transaction' : 'transactions'}`
          : 'Nothing to categorize'
      }
      className={cn('gap-2', className)}
      contentClassName="flex flex-1 flex-col gap-3"
      action={
        <Link to="/review" search={{ tab: 'categorization' }}>
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
      <CategorizationPanel {...panelProps} />

      <div className="border-t border-border-subtle pt-3">
        <ReviewHealth duplicates={duplicatesCount} dataIssues={dataIssues} autoFixed={autoFixed} />
      </div>

      <EditTransactionDialog
        transaction={editing}
        categories={categories}
        onClose={() => setEditing(null)}
      />
    </SectionCard>
  )
}
