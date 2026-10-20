import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { toast } from 'sonner'
import { AppLayout } from '@/components/domain/app-layout'
import { ProfileSelector } from '@/components/domain/profile-selector'
import { PageHeader } from '@/components/ui/page-header'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TableSkeleton } from '@/components/ui/skeleton'
import { getTransactionIds, type Transaction, type TransactionFilters } from '@/lib/api'
import { getKindOf } from '@/lib/category-kinds'
import { cn } from '@/lib/utils'
import {
  useAuth,
  useTransactions,
  useTransactionStats,
  useCategories,
  useAccounts,
  useStatements,
  useDebounce,
  useProfileSelection,
} from '@/hooks'
import {
  TransactionStats,
  TransactionFiltersBar,
  TransactionTable,
  TransactionEditForm,
  EditTransactionDialog,
  TransactionAddForm,
  Pagination,
  PaginationSummary,
  PageSizeSelect,
  BulkActionBar,
} from '@/components/transactions'
import type { SortBy, SortOrder } from '@/components/transactions'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { ListChecks, Plus, Receipt, Upload, X } from 'lucide-react'

// Filters live in the URL so a refresh, the back button or a shared link keeps them.
// List filters are comma-separated; flags are '1'.
interface TransactionsSearchParams {
  category?: string
  accountId?: string
  statementId?: string
  startDate?: string
  endDate?: string
  type?: 'credit' | 'debit'
  recurring?: '1'
  hidden?: '1'
  q?: string
}

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined

export const Route = createFileRoute('/transactions')({
  component: TransactionsPage,
  validateSearch: (search: Record<string, unknown>): TransactionsSearchParams => ({
    category: str(search.category),
    accountId: str(search.accountId),
    statementId: str(search.statementId),
    startDate: str(search.startDate),
    endDate: str(search.endDate),
    type: search.type === 'credit' || search.type === 'debit' ? search.type : undefined,
    recurring: search.recurring === '1' || search.recurring === 1 ? '1' : undefined,
    hidden: search.hidden === '1' || search.hidden === 1 ? '1' : undefined,
    q: str(search.q),
  }),
})

const joinList = (values?: string[]): string | undefined =>
  values?.length ? values.join(',') : undefined

function filtersFromSearch(params: TransactionsSearchParams): TransactionFilters {
  return {
    ...(params.category && { category: params.category.split(',') }),
    ...(params.accountId && { accountId: params.accountId.split(',') }),
    ...(params.statementId && { statementId: params.statementId.split(',') }),
    ...(params.startDate && { startDate: params.startDate }),
    ...(params.endDate && { endDate: params.endDate }),
    ...(params.type && { type: params.type }),
    ...(params.recurring && { isSubscription: true }),
    ...(params.hidden && { onlyHidden: true }),
  }
}

function searchFromFilters(filters: TransactionFilters, q: string): TransactionsSearchParams {
  return {
    category: joinList(filters.category),
    accountId: joinList(filters.accountId),
    statementId: joinList(filters.statementId),
    startDate: filters.startDate,
    endDate: filters.endDate,
    type: filters.type,
    recurring: filters.isSubscription ? '1' : undefined,
    hidden: filters.onlyHidden ? '1' : undefined,
    q: q || undefined,
  }
}

function TransactionsPage() {
  const { user, profiles } = useAuth()
  const {
    activeProfileId,
    showFamilyView,
    selectorProfileId,
    handleProfileChange,
    handleFamilyViewChange,
  } = useProfileSelection()
  const countryCode = user?.country?.toLowerCase() || 'in'
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  // Filter state
  const searchParams = useSearch({ from: '/transactions' })
  const navigate = useNavigate({ from: '/transactions' })
  const [filters, setFilters] = useState<TransactionFilters>(() => filtersFromSearch(searchParams))
  const [search, setSearch] = useState(searchParams.q ?? '')
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState<SortBy>('date')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [limit, setLimit] = useState(25)
  const [selectingAll, setSelectingAll] = useState(false)

  // Debounce search to avoid excessive API calls
  const debouncedSearch = useDebounce(search, 300)

  // Mirror the filters into the URL without adding history entries
  useEffect(() => {
    void navigate({ search: searchFromFilters(filters, debouncedSearch), replace: true })
  }, [filters, debouncedSearch, navigate])

  // Query enabled when we have a profileId OR we're in family view
  const queryEnabled = !!activeProfileId || showFamilyView

  // Build active filters
  const activeFilters: TransactionFilters & { enabled?: boolean } = {
    ...filters,
    profileId: activeProfileId,
    search: debouncedSearch || undefined,
    enabled: queryEnabled,
  }

  // Query hooks
  const {
    data: transactionsData,
    isLoading: transactionsLoading,
    isPlaceholderData: transactionsStale,
  } = useTransactions(activeFilters, { page, limit, sortBy, sortOrder })
  // activeFilters carries includeHidden / onlyHidden from `filters`, so stats match the list
  const { data: stats, isLoading: statsLoading } = useTransactionStats(activeFilters)
  const { data: categoriesData } = useCategories()
  const { data: accounts } = useAccounts(activeProfileId, { enabled: queryEnabled })
  const { data: statements } = useStatements(activeProfileId, { enabled: queryEnabled })

  const transactions = transactionsData?.transactions || []
  const total = transactionsData?.total || 0
  const totalPages = Math.ceil(total / limit)
  const categories = categoriesData?.categories || []

  // Default stats for loading/empty state
  const displayStats = stats || {
    totalCredits: 0,
    totalDebits: 0,
    creditCount: 0,
    debitCount: 0,
    netAmount: 0,
    currency: 'INR',
  }

  const currency = stats?.currency || 'INR'

  // Net card wording: "spent" / "earned" only when the selected categories share one kind
  const selectedKinds = (filters.category ?? []).map((code) => getKindOf(categories, code))
  const netLabel: 'net' | 'spent' | 'earned' =
    selectedKinds.length > 0 && selectedKinds.every((kind) => kind === 'expense')
      ? 'spent'
      : selectedKinds.length > 0 && selectedKinds.every((kind) => kind === 'income')
        ? 'earned'
        : 'net'

  // Format amount with proper currency
  const formatAmount = (amount: number, curr: string) => {
    const locale = curr === 'INR' ? 'en-IN' : 'en-US'
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: curr,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const getCategoryLabel = (code: string) => {
    return categories.find((c) => c.code === code)?.label || code.replace(/_/g, ' ')
  }

  const toggleSelectionMode = () => {
    setSelectedIds(new Set())
    setSelectionMode((on) => !on)
  }

  const clearFilters = () => {
    setSelectedIds(new Set())
    setFilters({})
    setSearch('')
    setPage(1)
  }

  const handleFiltersChange = (newFilters: TransactionFilters) => {
    setSelectedIds(new Set())
    setFilters(newFilters)
    setPage(1)
  }

  const handleSearchChange = (newSearch: string) => {
    setSelectedIds(new Set())
    setSearch(newSearch)
    setPage(1)
  }

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit)
    setPage(1)
  }

  // Select every transaction matching the filters, not just the ones on this page
  const handleSelectAllMatching = async () => {
    setSelectingAll(true)
    try {
      const { ids, truncated } = await getTransactionIds(activeFilters)
      setSelectedIds(new Set(ids))
      if (truncated) {
        toast.info(`Selected the first ${ids.length.toLocaleString()} matching transactions`)
      }
    } catch {
      toast.error('Failed to select all matching transactions')
    } finally {
      setSelectingAll(false)
    }
  }

  const handleSortChange = (newSortBy: SortBy, newSortOrder: SortOrder) => {
    setSortBy(newSortBy)
    setSortOrder(newSortOrder)
    setPage(1)
  }

  const hasActiveFilters = Object.keys(filters).length > 0 || search

  // Determine stats label based on filters
  const getStatsLabel = () => {
    const parts: string[] = []
    if (filters.startDate || filters.endDate) {
      if (filters.startDate && filters.endDate) {
        parts.push(`${filters.startDate} to ${filters.endDate}`)
      } else if (filters.startDate) {
        parts.push(`From ${filters.startDate}`)
      } else {
        parts.push(`Until ${filters.endDate}`)
      }
    }
    if (filters.category?.length) {
      if (filters.category.length === 1) {
        parts.push(getCategoryLabel(filters.category[0]!))
      } else {
        parts.push(`${filters.category.length} categories`)
      }
    }
    if (filters.accountId?.length) {
      if (filters.accountId.length === 1) {
        const account = accounts?.find((a) => a.id === filters.accountId![0])
        parts.push(account?.accountName || 'Selected account')
      } else {
        parts.push(`${filters.accountId.length} accounts`)
      }
    }
    if (filters.statementId?.length) {
      parts.push(
        `${filters.statementId.length} statement${filters.statementId.length > 1 ? 's' : ''}`
      )
    }
    return parts.length > 0 ? parts.join(' · ') : 'All time'
  }

  return (
    <AppLayout>
      <div className={cn('space-y-6', selectedIds.size > 0 && 'pb-24')}>
        {/* Page Header */}
        <PageHeader
          title="Transactions"
          description="View and manage your transactions"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setAddOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add transaction
              </Button>
              <ProfileSelector
                selectedProfileId={selectorProfileId}
                onProfileChange={(profile) => {
                  handleProfileChange(profile)
                  setPage(1)
                }}
                showFamilyView={showFamilyView}
                onFamilyViewChange={(enabled) => {
                  handleFamilyViewChange(enabled)
                  setPage(1)
                }}
              />
            </div>
          }
        />

        {/* Stats Cards */}
        <TransactionStats
          totalCredits={displayStats.totalCredits}
          totalDebits={displayStats.totalDebits}
          creditCount={displayStats.creditCount}
          debitCount={displayStats.debitCount}
          netAmount={displayStats.netAmount}
          currency={currency}
          statsLabel={getStatsLabel()}
          isLoading={statsLoading}
          formatAmount={formatAmount}
          netLabel={netLabel}
        />

        {/* Filters */}
        <TransactionFiltersBar
          filters={filters}
          search={search}
          categories={categories}
          accounts={accounts || []}
          statements={statements || []}
          country={user?.country}
          onFiltersChange={handleFiltersChange}
          onSearchChange={handleSearchChange}
          onClearFilters={clearFilters}
          getCategoryLabel={getCategoryLabel}
        />

        {/* Add Transaction Dialog */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>Add Transaction</DialogTitle>
              <DialogDescription>
                For cash expenses or rows missing from your statements.
              </DialogDescription>
            </DialogHeader>
            <TransactionAddForm
              accounts={(accounts ?? []).filter((a) => a.isActive)}
              categories={categories}
              onClose={() => setAddOpen(false)}
              onSuccess={() => setAddOpen(false)}
            />
          </DialogContent>
        </Dialog>

        <EditTransactionDialog
          transaction={editingTransaction}
          categories={categories}
          onClose={() => setEditingTransaction(null)}
        />

        {/* Bulk Edit Dialog */}
        <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit {selectedIds.size} Transactions</DialogTitle>
              <DialogDescription>
                Only the fields you change are applied to every selected transaction.
              </DialogDescription>
            </DialogHeader>
            <TransactionEditForm
              transactionIds={[...selectedIds]}
              categories={categories}
              onClose={() => setBulkEditOpen(false)}
              onSuccess={() => {
                setBulkEditOpen(false)
                setSelectedIds(new Set())
              }}
            />
          </DialogContent>
        </Dialog>

        {/* Selection action bar */}
        {selectedIds.size > 0 && (
          <BulkActionBar
            selectedIds={selectedIds}
            totalMatching={total}
            filtered={!!hasActiveFilters}
            pageFullySelected={transactions.every((t) => selectedIds.has(t.id))}
            categories={categories}
            showingHidden={!!filters.onlyHidden}
            selectingAll={selectingAll}
            onSelectAllMatching={handleSelectAllMatching}
            onEdit={() => setBulkEditOpen(true)}
            onClear={() => setSelectedIds(new Set())}
          />
        )}

        {/* Selection toggle and result count */}
        {!transactionsLoading && transactions.length > 0 && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-pressed={selectionMode}
              onClick={toggleSelectionMode}
              className={cn(
                'flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium border transition-all duration-200',
                selectionMode
                  ? 'bg-surface-hover border-border-hover text-muted-foreground hover:text-foreground'
                  : 'bg-surface-elevated border-border-subtle text-muted-foreground hover:text-foreground hover:border-border-hover'
              )}
            >
              {selectionMode ? (
                <X className="h-3.5 w-3.5" />
              ) : (
                <ListChecks className="h-3.5 w-3.5" />
              )}
              <span>{selectionMode ? 'Cancel' : 'Select'}</span>
            </button>
            <PaginationSummary page={page} total={total} limit={limit} />
            <div className="ml-auto">
              <PageSizeSelect limit={limit} onLimitChange={handleLimitChange} />
            </div>
          </div>
        )}

        {/* Transactions Table */}
        {transactionsLoading ? (
          <TableSkeleton rows={10} columns={4} />
        ) : transactions.length > 0 ? (
          // Dim the previous results while the new ones load
          <div className={cn('transition-opacity duration-200', transactionsStale && 'opacity-60')}>
            <TransactionTable
              transactions={transactions}
              accounts={accounts || []}
              categories={categories}
              countryCode={countryCode}
              onEditTransaction={setEditingTransaction}
              getCategoryLabel={getCategoryLabel}
              formatAmount={formatAmount}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={handleSortChange}
              profiles={profiles}
              showProfileBadge={showFamilyView}
              selectedIds={selectionMode ? selectedIds : undefined}
              onSelectionChange={selectionMode ? setSelectedIds : undefined}
            />
          </div>
        ) : (
          <EmptyState
            icon={hasActiveFilters ? Receipt : Upload}
            title={hasActiveFilters ? 'No transactions found' : 'No transactions yet'}
            description={
              hasActiveFilters
                ? 'Try adjusting your filters to see more results'
                : 'Upload a bank or credit card statement to start tracking your transactions.'
            }
            action={
              hasActiveFilters
                ? { label: 'Clear filters', onClick: clearFilters, icon: X }
                : {
                    label: 'Upload Statement',
                    href: '/statements?upload=true',
                    icon: Upload,
                  }
            }
          />
        )}

        {/* Pagination - bottom of the page, centred */}
        {!transactionsLoading && transactions.length > 0 && (
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        )}
      </div>
    </AppLayout>
  )
}
