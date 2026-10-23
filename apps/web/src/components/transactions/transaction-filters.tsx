import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Label } from '@/components/ui/label'
import { AccountSelector } from '@/components/ui/account-selector'
import { BANK_MESSAGES_SOURCE, SourceSelector } from '@/components/ui/source-selector'
import { DateRangePicker, getDateRangeLabel } from '@/components/ui/date-range-picker'
import {
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  Calendar,
  Building2,
  Tag,
  FileText,
  Check,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown,
  Sparkles,
  EyeOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TransactionFilters, Category, Account, Statement } from '@/lib/api'
import { useConstants } from '@/hooks/useConstants'
import { useSmsImportStatus } from '@/hooks/useSmsImport'
import { getAccountShortLabel, getStatementPeriodLabel } from '@/lib/statement-display'
import { MetaLabel } from '@/components/ui/meta-label'
import { CategoryPicker } from './category-picker'

interface TransactionFiltersBarProps {
  filters: TransactionFilters
  search: string
  categories: Category[]
  accounts: Account[]
  statements: Statement[]
  country?: string | null
  onFiltersChange: (filters: TransactionFilters) => void
  onSearchChange: (search: string) => void
  onClearFilters: () => void
  getCategoryLabel: (code: string) => string
}

export function TransactionFiltersBar({
  filters,
  search,
  categories,
  accounts,
  statements,
  country,
  onFiltersChange,
  onSearchChange,
  onClearFilters,
  getCategoryLabel,
}: TransactionFiltersBarProps) {
  const { institutions } = useConstants()
  const { data: smsStatus } = useSmsImportStatus()
  const [searchFocused, setSearchFocused] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const getSourceLabel = (id: string) => {
    if (id === BANK_MESSAGES_SOURCE) return 'Bank Messages'
    const statement = statements.find((s) => s.id === id)
    if (!statement) return 'Statement'
    const account = accounts.find((a) => a.id === statement.accountId)
    const period = getStatementPeriodLabel(statement)
    return account
      ? `${period} · ${getAccountShortLabel(account, institutions[account.institution ?? ''])}`
      : period
  }

  // Check for advanced filters to auto-expand
  const hasAdvancedFilters = Boolean(
    filters.category?.length ||
    filters.accountId?.length ||
    filters.statementId?.length ||
    filters.startDate ||
    filters.endDate ||
    filters.onlyHidden
  )

  const hasActiveFilters =
    Object.keys(filters).filter(
      (k) => k !== 'profileId' && k !== 'isSubscription' && k !== 'onlyHidden'
    ).length > 0 ||
    search ||
    filters.isSubscription ||
    filters.onlyHidden

  // Start open when advanced filters are already applied (e.g. from the URL), but let it collapse
  const [showAdvanced, setShowAdvanced] = useState(hasAdvancedFilters)

  const removeFilter = (key: keyof TransactionFilters) => {
    const newFilters = { ...filters }
    delete newFilters[key]
    onFiltersChange(newFilters)
  }

  // One per pill the advanced panel produces: each category, account and statement counts
  const activeFilterCount =
    (filters.category?.length ?? 0) +
    (filters.accountId?.length ?? 0) +
    (filters.statementId?.length ?? 0) +
    (filters.startDate || filters.endDate ? 1 : 0) +
    (filters.onlyHidden ? 1 : 0)

  return (
    <div className="space-y-3">
      {/* Main Filter Bar */}
      <div
        className={cn(
          'relative flex flex-col p-4 rounded-2xl transition-all duration-300',
          'bg-linear-to-b from-card to-card/80',
          'border border-border-subtle',
          'shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]',
          'dark:shadow-[0_1px_3px_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.15)]'
        )}
      >
        {/* Top Row: Search + Quick Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Input - Command Bar Style */}
          <div className="relative flex-1 min-w-60">
            <div
              className={cn(
                'absolute inset-0 rounded-xl transition-all duration-200',
                searchFocused
                  ? 'bg-primary/5 ring-2 ring-primary/20 dark:ring-primary/30'
                  : 'bg-transparent'
              )}
            />
            <Search
              className={cn(
                'absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors',
                searchFocused ? 'text-primary' : 'text-muted-foreground'
              )}
            />
            <Input
              ref={searchRef}
              placeholder="Search transactions..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className={cn(
                'relative pl-10 pr-4 h-11 rounded-xl border-0',
                'bg-surface-elevated dark:bg-surface-elevated',
                'placeholder:text-muted-foreground/60',
                'focus-visible:ring-0 focus-visible:ring-offset-0',
                'transition-all duration-200'
              )}
            />
            {search && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-surface-hover transition-colors"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Quick Filter Chips */}
          <div className="flex shrink-0 items-center gap-2">
            {/* Transaction Type Selector */}
            <SegmentedControl
              aria-label="Transaction type"
              value={filters.type ?? 'all'}
              onChange={(type) => {
                if (type === 'all') removeFilter('type')
                else onFiltersChange({ ...filters, type })
              }}
              options={[
                { value: 'all', label: 'All' },
                {
                  value: 'credit',
                  label: 'Money in',
                  icon: <ArrowDownLeft className="h-3.5 w-3.5" />,
                  activeClassName:
                    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-sm',
                },
                {
                  value: 'debit',
                  label: 'Money out',
                  icon: <ArrowUpRight className="h-3.5 w-3.5" />,
                  activeClassName: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 shadow-sm',
                },
              ]}
            />

            {/* Subscription Toggle */}
            <button
              onClick={() =>
                onFiltersChange({
                  ...filters,
                  isSubscription: filters.isSubscription ? undefined : true,
                })
              }
              className={cn(
                'flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                'border',
                filters.isSubscription
                  ? 'bg-violet-500/10 border-violet-500/30 text-violet-600 dark:text-violet-400'
                  : 'bg-surface-elevated border-border-subtle text-muted-foreground hover:text-foreground hover:border-border-hover'
              )}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Recurring</span>
            </button>

            {/* More Filters Toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={cn(
                'flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                'border',
                showAdvanced || activeFilterCount > 0
                  ? 'bg-primary/5 border-primary/20 text-primary'
                  : 'bg-surface-elevated border-border-subtle text-muted-foreground hover:text-foreground hover:border-border-hover'
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-semibold rounded-full bg-primary text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 transition-transform duration-200',
                  showAdvanced && 'rotate-180'
                )}
              />
            </button>
          </div>
        </div>

        {/* Advanced Filters Panel */}
        <div
          className={cn(
            'grid transition-all duration-300 ease-out overflow-hidden',
            showAdvanced ? 'mt-4 grid-rows-[1fr] opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0'
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              className={cn(
                'pt-3 border-t border-border-subtle',
                'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'
              )}
            >
              {/* Category Filter */}
              <CategoryFilterDropdown
                categories={categories}
                selectedCategories={filters.category}
                onlyHidden={filters.onlyHidden}
                getCategoryLabel={getCategoryLabel}
                onClear={() => {
                  const newFilters = { ...filters }
                  delete newFilters.category
                  delete newFilters.onlyHidden
                  onFiltersChange(newFilters)
                }}
                onSetCategories={(codes) => {
                  onFiltersChange({
                    ...filters,
                    category: codes.length > 0 ? codes : undefined,
                  })
                }}
                onToggleHidden={() => {
                  onFiltersChange({
                    ...filters,
                    onlyHidden: !filters.onlyHidden,
                    // Clear category filter when showing hidden
                    category: !filters.onlyHidden ? undefined : filters.category,
                  })
                }}
              />

              {/* Account Filter */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="h-3 w-3" />
                  Account
                </Label>
                <AccountSelector
                  accounts={accounts}
                  values={filters.accountId || []}
                  onValuesChange={(accountIds) => {
                    const newFilters = {
                      ...filters,
                      accountId: accountIds.length > 0 ? accountIds : undefined,
                    }
                    // Filter statements to only those belonging to selected accounts
                    if (filters.statementId?.length && accountIds.length > 0) {
                      const validStatements = filters.statementId.filter(
                        (id) =>
                          id === BANK_MESSAGES_SOURCE ||
                          accountIds.includes(statements?.find((s) => s.id === id)?.accountId || '')
                      )
                      newFilters.statementId =
                        validStatements.length > 0 ? validStatements : undefined
                    }
                    onFiltersChange(newFilters)
                  }}
                  mode="multi"
                  showAllOption
                  allOptionLabel="All accounts"
                  contentClassName="w-96"
                  triggerClassName={cn(
                    'w-full h-10 rounded-lg',
                    'bg-surface-elevated border-border-subtle',
                    'hover:bg-surface-hover hover:border-border-hover',
                    filters.accountId?.length && 'border-primary/30 bg-primary/5'
                  )}
                />
              </div>

              {/* Date Range */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  Date Range
                </Label>
                <DateRangePicker
                  startDate={filters.startDate}
                  endDate={filters.endDate}
                  country={country}
                  variant="outline"
                  onDateChange={(startDate, endDate) => {
                    const newFilters = { ...filters }
                    if (startDate) {
                      newFilters.startDate = startDate
                    } else {
                      delete newFilters.startDate
                    }
                    if (endDate) {
                      newFilters.endDate = endDate
                    } else {
                      delete newFilters.endDate
                    }
                    onFiltersChange(newFilters)
                  }}
                  className="w-full"
                />
              </div>

              {/* Source Filter: statements and bank messages */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="h-3 w-3" />
                  Source
                </Label>
                <SourceSelector
                  showBankMessages={smsStatus?.supported}
                  statements={statements}
                  accounts={accounts}
                  values={filters.statementId || []}
                  accountIds={filters.accountId}
                  onValuesChange={(ids) =>
                    onFiltersChange({ ...filters, statementId: ids.length > 0 ? ids : undefined })
                  }
                  triggerClassName={cn(
                    'w-full h-10 rounded-lg',
                    'bg-surface-elevated border-border-subtle',
                    'hover:bg-surface-hover hover:border-border-hover',
                    filters.statementId?.length && 'border-primary/30 bg-primary/5'
                  )}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Filters Pills */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <MetaLabel>Active:</MetaLabel>
          {search && (
            <FilterPill
              label={`"${search}"`}
              icon={<Search className="h-3 w-3" />}
              onRemove={() => onSearchChange('')}
            />
          )}
          {filters.type && (
            <FilterPill
              label={filters.type === 'credit' ? 'Money in' : 'Money out'}
              icon={
                filters.type === 'credit' ? (
                  <ArrowDownLeft className="h-3 w-3" />
                ) : (
                  <ArrowUpRight className="h-3 w-3" />
                )
              }
              variant={filters.type === 'credit' ? 'success' : 'danger'}
              onRemove={() => removeFilter('type')}
            />
          )}
          {filters.isSubscription && (
            <FilterPill
              label="Recurring"
              icon={<RefreshCw className="h-3 w-3" />}
              variant="violet"
              onRemove={() => removeFilter('isSubscription')}
            />
          )}
          {filters.onlyHidden && (
            <FilterPill
              label="Hidden"
              icon={<EyeOff className="h-3 w-3" />}
              onRemove={() => removeFilter('onlyHidden')}
            />
          )}
          {filters.category?.map((cat) => (
            <FilterPill
              key={cat}
              label={getCategoryLabel(cat)}
              icon={<Tag className="h-3 w-3" />}
              onRemove={() => {
                const updated = filters.category?.filter((c) => c !== cat)
                onFiltersChange({
                  ...filters,
                  category: updated?.length ? updated : undefined,
                })
              }}
            />
          ))}
          {filters.accountId?.map((id) => (
            <FilterPill
              key={id}
              label={accounts?.find((a) => a.id === id)?.accountName || 'Account'}
              icon={<Building2 className="h-3 w-3" />}
              onRemove={() => {
                const updated = filters.accountId?.filter((a) => a !== id)
                onFiltersChange({
                  ...filters,
                  accountId: updated?.length ? updated : undefined,
                })
              }}
            />
          ))}
          {(filters.startDate || filters.endDate) && (
            <FilterPill
              label={getDateRangeLabel(filters.startDate, filters.endDate, country)}
              icon={<Calendar className="h-3 w-3" />}
              onRemove={() => {
                const newFilters = { ...filters }
                delete newFilters.startDate
                delete newFilters.endDate
                onFiltersChange(newFilters)
              }}
            />
          )}
          {filters.statementId?.map((id) => (
            <FilterPill
              key={id}
              label={getSourceLabel(id)}
              icon={<FileText className="h-3 w-3" />}
              onRemove={() => {
                const updated = filters.statementId?.filter((s) => s !== id)
                onFiltersChange({
                  ...filters,
                  statementId: updated?.length ? updated : undefined,
                })
              }}
            />
          ))}

          {/* Clear All */}
          <button
            onClick={onClearFilters}
            className="ml-auto flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            <span>Clear all</span>
          </button>
        </div>
      )}
    </div>
  )
}

// Category filter: multi-select picker plus "All categories" and "Hidden" rows
function CategoryFilterDropdown({
  categories,
  selectedCategories,
  onlyHidden,
  getCategoryLabel,
  onClear,
  onSetCategories,
  onToggleHidden,
}: {
  categories: Category[]
  selectedCategories?: string[]
  onlyHidden?: boolean
  getCategoryLabel: (code: string) => string
  onClear: () => void
  onSetCategories: (codes: string[]) => void
  onToggleHidden: () => void
}) {
  const selected = selectedCategories ?? []
  const triggerLabel = onlyHidden
    ? 'Hidden'
    : selected.length === 1
      ? getCategoryLabel(selected[0]!)
      : selected.length
        ? `${selected.length} selected`
        : 'All categories'

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Tag className="h-3 w-3" />
        Category
      </Label>
      <CategoryPicker
        multiple
        categories={categories}
        values={selected}
        onValuesChange={onSetCategories}
        triggerLabel={triggerLabel}
        triggerIcon={onlyHidden && <EyeOff className="h-4 w-4 text-muted-foreground" />}
        triggerClassName={cn((selected.length || onlyHidden) && 'border-primary/30 bg-primary/5')}
        contentClassName="w-96"
        disabled={onlyHidden}
        leadingRows={
          <>
            <Button
              variant={!selected.length && !onlyHidden ? 'secondary' : 'ghost'}
              size="sm"
              className="w-full justify-start gap-2 px-2"
              onClick={onClear}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center" />
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              All categories
            </Button>
            <Button
              variant={onlyHidden ? 'secondary' : 'ghost'}
              size="sm"
              className="w-full justify-start gap-2 px-2"
              onClick={onToggleHidden}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {onlyHidden && <Check className="h-4 w-4 text-primary" />}
              </span>
              <EyeOff className="h-4 w-4 text-muted-foreground" />
              Hidden
            </Button>
          </>
        }
      />
    </div>
  )
}

// Filter Pill Component
function FilterPill({
  label,
  icon,
  variant = 'default',
  onRemove,
}: {
  label: string
  icon?: React.ReactNode
  variant?: 'default' | 'success' | 'danger' | 'violet'
  onRemove: () => void
}) {
  const variantStyles = {
    default: 'bg-surface-elevated text-foreground border-border-subtle',
    success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
    danger: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20',
    violet: 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg text-xs font-medium border transition-all',
        'hover:shadow-sm',
        variantStyles[variant]
      )}
    >
      {icon}
      <span className="max-w-37.5 truncate">{label}</span>
      <button
        onClick={onRemove}
        className={cn(
          'p-0.5 rounded-md transition-colors',
          'hover:bg-black/5 dark:hover:bg-white/10'
        )}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}
