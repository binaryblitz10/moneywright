import { useState } from 'react'
import { createFileRoute, useSearch } from '@tanstack/react-router'
import { Wrench } from 'lucide-react'
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
import {
  CategorizationPanel,
  DuplicatesPanel,
  FixIssuesDialog,
  HistoryPanel,
  PossibleMatchesPanel,
} from '@/components/review'
import { Button } from '@/components/ui/button'

type ReviewTab = 'duplicates' | 'categorization' | 'possible_matches' | 'history'

interface ReviewSearchParams {
  tab?: ReviewTab
  /** Set when an old 'auto-fixed' link opens the History tab on its Auto-fixed segment */
  segment?: 'auto-fixed'
}

export const Route = createFileRoute('/_app/review')({
  component: ReviewPage,
  validateSearch: (search: Record<string, unknown>): ReviewSearchParams => ({
    segment: search.tab === 'auto-fixed' ? 'auto-fixed' : undefined,
    tab:
      search.tab === 'categorization' ||
      search.tab === 'possible_matches' ||
      search.tab === 'history'
        ? search.tab
        : search.tab === 'auto-fixed'
          ? 'history'
          : search.tab === 'low_confidence'
            ? 'categorization'
            : undefined,
  }),
})

function ReviewPage() {
  const { user, profiles } = useAuth()
  const navigate = Route.useNavigate()
  const { tab, segment } = useSearch({ from: '/_app/review' })
  const activeTab: ReviewTab = tab ?? 'duplicates'
  const { activeProfileId, showFamilyView } = useProfileSelection()
  const countryCode = user?.country?.toLowerCase() || 'in'

  const [fixOpen, setFixOpen] = useState(false)
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

  const categorizationCount = counts
    ? counts.pending + counts.other + counts.lowConfidence
    : undefined

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review"
        description="Resolve duplicates and sort out transactions that need a category"
        actions={
          <Button onClick={() => setFixOpen(true)}>
            <Wrench className="h-4 w-4 mr-2" />
            Fix issues
          </Button>
        }
      />

      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          navigate({
            search: {
              tab:
                value === 'categorization' || value === 'possible_matches' || value === 'history'
                  ? value
                  : undefined,
            },
          })
        }
      >
        <TabsList className="max-w-full justify-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsTrigger value="duplicates">
            Duplicates
            {counts && (
              <span className="text-xs text-muted-foreground">{counts.duplicateGroups}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="categorization">
            Categories
            {categorizationCount !== undefined && (
              <span className="text-xs text-muted-foreground">{categorizationCount}</span>
            )}
          </TabsTrigger>
          {(counts?.possibleMatches ?? 0) > 0 && (
            <TabsTrigger value="possible_matches">
              Possible matches
              <span className="text-xs text-muted-foreground">{counts?.possibleMatches}</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab !== 'possible_matches' && activeTab !== 'history' && (
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
      )}

      {activeTab === 'duplicates' ? (
        <DuplicatesPanel {...panelProps} />
      ) : activeTab === 'history' ? (
        <HistoryPanel {...panelProps} initialSegment={segment ?? 'merged'} />
      ) : activeTab === 'possible_matches' ? (
        <PossibleMatchesPanel {...panelProps} />
      ) : (
        <CategorizationPanel {...panelProps} />
      )}

      <FixIssuesDialog open={fixOpen} onOpenChange={setFixOpen} profileId={activeProfileId} />

      <EditTransactionDialog
        transaction={editingTransaction}
        categories={categories}
        onClose={() => setEditingTransaction(null)}
      />
    </div>
  )
}
