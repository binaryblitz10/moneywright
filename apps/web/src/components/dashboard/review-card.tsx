import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { EditTransactionDialog } from '@/components/transactions'
import { Button } from '@/components/ui/button'
import { SectionCard } from '@/components/ui/section-card'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { cn } from '@/lib/utils'
import { useAccounts, useDataHealth, useReviewCounts, useTransactions } from '@/hooks'
import { ReviewDeck, type ReviewQueue } from './review-deck'
import { ReviewHealth } from './review-health'
import type { Category, Transaction } from '@/lib/api'

/** Cards loaded at a time; settling them refetches the next ones */
const DECK_SIZE = 20

interface ReviewCardProps {
  /** Undefined in family view, which reviews everyone's transactions */
  profileId: string | undefined
  enabled: boolean
  categories: Category[]
  countryCode: string
  className?: string
}

/** Transactions that need a category and data health problems, settled from the dashboard */
export function ReviewCard({
  profileId,
  enabled,
  categories,
  countryCode,
  className,
}: ReviewCardProps) {
  const [chosenQueue, setChosenQueue] = useState<ReviewQueue | null>(null)
  const [editing, setEditing] = useState<Transaction | null>(null)

  const { data: counts } = useReviewCounts(profileId)
  const { data: accounts } = useAccounts(profileId, { enabled })
  const { data: health } = useDataHealth(profileId, { enabled })

  const categorizeCount = counts ? counts.pending + counts.other : 0
  const checkCount = counts?.lowConfidence ?? 0
  // Start on the queue that has something in it, until one is picked
  const queue: ReviewQueue =
    chosenQueue ?? (categorizeCount === 0 && checkCount > 0 ? 'check' : 'categorize')

  // Biggest amounts first: they move the totals most
  const { data, isLoading } = useTransactions(
    { profileId, reviewStatus: queue === 'check' ? 'low_confidence' : 'all', enabled },
    { page: 1, limit: DECK_SIZE, sortBy: 'amount', sortOrder: 'desc' }
  )

  // The shaky-category check is already its own queue here
  const dataIssues = Math.max(
    0,
    (health?.issueCount ?? 0) - ((health?.lowConfidence.count ?? 0) > 0 ? 1 : 0)
  )
  const toReview = categorizeCount + checkCount

  return (
    <SectionCard
      title="Review"
      description={
        toReview > 0
          ? `${toReview} ${toReview === 1 ? 'transaction' : 'transactions'}`
          : 'Nothing to review'
      }
      className={cn('gap-2', className)}
      contentClassName="space-y-5"
      action={
        <Link
          to="/review"
          search={{ tab: queue === 'check' ? 'low_confidence' : 'categorization' }}
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            Open
            <ChevronRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
      }
    >
      <SegmentedControl
        aria-label="Review queue"
        size="sm"
        value={queue}
        onChange={setChosenQueue}
        options={[
          {
            value: 'categorize',
            label: (
              <>
                Uncategorised <span className="tabular-nums opacity-70">{categorizeCount}</span>
              </>
            ),
          },
          {
            value: 'check',
            label: (
              <>
                Low confidence <span className="tabular-nums opacity-70">{checkCount}</span>
              </>
            ),
          },
        ]}
      />

      {/* Keyed so each queue starts with its own settled and skipped cards */}
      <ReviewDeck
        key={queue}
        queue={queue}
        transactions={data?.transactions ?? []}
        isLoading={isLoading}
        accounts={accounts ?? []}
        categories={categories}
        countryCode={countryCode}
        onEdit={setEditing}
      />

      <div className="border-t border-border-subtle pt-4">
        <ReviewHealth
          duplicateGroups={counts?.duplicateGroups ?? 0}
          possibleMatches={counts?.possibleMatches ?? 0}
          dataIssues={dataIssues}
        />
      </div>

      <EditTransactionDialog
        transaction={editing}
        categories={categories}
        onClose={() => setEditing(null)}
      />
    </SectionCard>
  )
}
