import { useState } from 'react'
import { createFileRoute, useSearch } from '@tanstack/react-router'
import { PageHeader } from '@/components/ui/page-header'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Transaction, TransactionFilters } from '@/lib/api'
import { useAuth, useCategories, useAccounts, useProfileSelection, useReviewCounts } from '@/hooks'
import { EditTransactionDialog } from '@/components/transactions'
import { CategorizationPanel, DuplicatesPanel, HistoryPanel } from '@/components/review'

type ReviewTab = 'duplicates' | 'categorization' | 'history'

interface ReviewSearchParams {
  tab?: ReviewTab
}

export const Route = createFileRoute('/_app/review')({
  component: ReviewPage,
  validateSearch: (search: Record<string, unknown>): ReviewSearchParams => ({
    tab:
      search.tab === 'categorization' || search.tab === 'history'
        ? search.tab
        : search.tab === 'auto-fixed'
          ? 'history'
          : search.tab === 'low_confidence'
            ? 'categorization'
            : search.tab === 'possible_matches'
              ? 'duplicates'
              : undefined,
  }),
})

function ReviewPage() {
  const { user, profiles } = useAuth()
  const navigate = Route.useNavigate()
  const { tab } = useSearch({ from: '/_app/review' })
  const activeTab: ReviewTab = tab ?? 'duplicates'
  const { activeProfileId, showFamilyView } = useProfileSelection()
  const countryCode = user?.country?.toLowerCase() || 'in'

  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)

  const queryEnabled = !!activeProfileId || showFamilyView
  const activeFilters: TransactionFilters & { enabled?: boolean } = {
    profileId: activeProfileId,
    enabled: queryEnabled,
  }

  const { data: categoriesData } = useCategories()
  const { data: accounts } = useAccounts(activeProfileId, { enabled: queryEnabled })
  const { data: counts } = useReviewCounts(activeProfileId)
  const categories = categoriesData?.categories || []

  const formatAmount = (amount: number, curr: string) => {
    const locale = curr === 'INR' ? 'en-IN' : 'en-US'
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: curr,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const getCategoryLabel = (code: string) =>
    categories.find((c) => c.code === code)?.label || code.replace(/_/g, ' ')

  const panelProps = {
    filters: activeFilters,
    accounts: accounts || [],
    categories,
    countryCode,
    profiles,
    showProfileBadge: showFamilyView,
    onEditTransaction: setEditingTransaction,
    getCategoryLabel,
    formatAmount,
  }

  const categorizationCount = counts
    ? counts.pending + counts.other + counts.lowConfidence
    : undefined

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review"
        description="Resolve duplicates and sort out transactions that need a category"
      />

      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          navigate({
            search: {
              tab: value === 'categorization' || value === 'history' ? value : undefined,
            },
          })
        }
      >
        <TabsList className="max-w-full justify-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsTrigger value="duplicates">
            Duplicates
            {counts && (
              <span className="text-xs text-muted-foreground">
                {counts.duplicateGroups + counts.possibleMatches}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="categorization">
            Categories
            {categorizationCount !== undefined && (
              <span className="text-xs text-muted-foreground">{categorizationCount}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === 'history' ? (
        <HistoryPanel {...panelProps} />
      ) : (
        <div className="rounded-2xl border border-border-subtle bg-card p-4 sm:p-6">
          {activeTab === 'duplicates' ? (
            <DuplicatesPanel {...panelProps} />
          ) : (
            <CategorizationPanel {...panelProps} />
          )}
        </div>
      )}

      <EditTransactionDialog
        transaction={editingTransaction}
        categories={categories}
        onClose={() => setEditingTransaction(null)}
      />
    </div>
  )
}
