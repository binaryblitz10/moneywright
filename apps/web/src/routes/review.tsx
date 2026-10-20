import { useState } from 'react'
import { createFileRoute, useSearch } from '@tanstack/react-router'
import { AppLayout } from '@/components/domain/app-layout'
import { ProfileSelector } from '@/components/domain/profile-selector'
import { PageHeader } from '@/components/ui/page-header'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Transaction, TransactionFilters } from '@/lib/api'
import {
  useAuth,
  useCategories,
  useAccounts,
  useStatements,
  useDebounce,
  useProfileSelection,
  useReviewCounts,
} from '@/hooks'
import { TransactionFiltersBar, EditTransactionDialog } from '@/components/transactions'
import { CategorizationPanel, DuplicatesPanel } from '@/components/review'

type ReviewTab = 'duplicates' | 'categorization' | 'low_confidence'

interface ReviewSearchParams {
  tab?: ReviewTab
}

export const Route = createFileRoute('/review')({
  component: ReviewPage,
  validateSearch: (search: Record<string, unknown>): ReviewSearchParams => ({
    tab:
      search.tab === 'categorization' || search.tab === 'low_confidence' ? search.tab : undefined,
  }),
})

function ReviewPage() {
  const { user, profiles } = useAuth()
  const navigate = Route.useNavigate()
  const { tab } = useSearch({ from: '/review' })
  const activeTab: ReviewTab = tab ?? 'duplicates'
  const {
    activeProfileId,
    showFamilyView,
    selectorProfileId,
    handleProfileChange,
    handleFamilyViewChange,
  } = useProfileSelection()
  const countryCode = user?.country?.toLowerCase() || 'in'

  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [filters, setFilters] = useState<TransactionFilters>({})
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  const queryEnabled = !!activeProfileId || showFamilyView
  const activeFilters: TransactionFilters & { enabled?: boolean } = {
    ...filters,
    profileId: activeProfileId,
    search: debouncedSearch || undefined,
    enabled: queryEnabled,
  }

  const { data: categoriesData } = useCategories()
  const { data: accounts } = useAccounts(activeProfileId, { enabled: queryEnabled })
  const { data: statements } = useStatements(activeProfileId, { enabled: queryEnabled })
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

  const categorizationCount = counts ? counts.pending + counts.other : undefined

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="Review"
          description="Resolve duplicate, uncategorized and low-confidence transactions"
          actions={
            <ProfileSelector
              selectedProfileId={selectorProfileId}
              onProfileChange={handleProfileChange}
              showFamilyView={showFamilyView}
              onFamilyViewChange={handleFamilyViewChange}
            />
          }
        />

        <Tabs
          value={activeTab}
          onValueChange={(value) =>
            navigate({
              search: {
                tab: value === 'categorization' || value === 'low_confidence' ? value : undefined,
              },
            })
          }
        >
          <TabsList>
            <TabsTrigger value="duplicates">
              Duplicates
              {counts && (
                <span className="text-xs text-muted-foreground">{counts.duplicateGroups}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="categorization">
              Needs categorization
              {categorizationCount !== undefined && (
                <span className="text-xs text-muted-foreground">{categorizationCount}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="low_confidence">
              Low confidence
              {counts && (
                <span className="text-xs text-muted-foreground">{counts.lowConfidence}</span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <TransactionFiltersBar
          filters={filters}
          search={search}
          categories={categories}
          accounts={accounts || []}
          statements={statements || []}
          country={user?.country}
          onFiltersChange={setFilters}
          onSearchChange={setSearch}
          onClearFilters={() => {
            setFilters({})
            setSearch('')
          }}
          getCategoryLabel={getCategoryLabel}
        />

        {activeTab === 'duplicates' ? (
          <DuplicatesPanel {...panelProps} />
        ) : (
          <CategorizationPanel
            key={activeTab}
            queue={activeTab === 'low_confidence' ? 'low_confidence' : 'categorization'}
            {...panelProps}
          />
        )}

        <EditTransactionDialog
          transaction={editingTransaction}
          categories={categories}
          onClose={() => setEditingTransaction(null)}
        />
      </div>
    </AppLayout>
  )
}
