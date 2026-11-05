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
  AutoFixedPanel,
  CategorizationPanel,
  DuplicatesPanel,
  FixIssuesDialog,
  PossibleMatchesPanel,
} from '@/components/review'
import { Button } from '@/components/ui/button'

type ReviewTab =
  | 'duplicates'
  | 'categorization'
  | 'low_confidence'
  | 'possible_matches'
  | 'auto-fixed'

interface ReviewSearchParams {
  tab?: ReviewTab
}

export const Route = createFileRoute('/_app/review')({
  component: ReviewPage,
  validateSearch: (search: Record<string, unknown>): ReviewSearchParams => ({
    tab:
      search.tab === 'categorization' ||
      search.tab === 'low_confidence' ||
      search.tab === 'possible_matches' ||
      search.tab === 'auto-fixed'
        ? search.tab
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

  const categorizationCount = counts ? counts.pending + counts.other : undefined

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review"
        description="Resolve duplicate, uncategorized and low-confidence transactions"
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
                value === 'categorization' ||
                value === 'low_confidence' ||
                value === 'possible_matches' ||
                value === 'auto-fixed'
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
          {(counts?.possibleMatches ?? 0) > 0 && (
            <TabsTrigger value="possible_matches">
              Possible matches
              <span className="text-xs text-muted-foreground">{counts?.possibleMatches}</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="auto-fixed">Auto-fixed</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab !== 'possible_matches' && activeTab !== 'auto-fixed' && (
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
      ) : activeTab === 'auto-fixed' ? (
        <AutoFixedPanel profileId={activeProfileId} />
      ) : activeTab === 'possible_matches' ? (
        <PossibleMatchesPanel {...panelProps} />
      ) : (
        <CategorizationPanel
          key={activeTab}
          queue={activeTab === 'low_confidence' ? 'low_confidence' : 'categorization'}
          {...panelProps}
        />
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
