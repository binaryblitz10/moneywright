import { useState, useMemo, useCallback } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  useAuth,
  useCategories,
  useMonthlyTrends,
  usePreferences,
  useSetPreference,
  useTransactionStats,
  useProfileSelection,
} from '@/hooks'
import { AppLayout } from '@/components/domain/app-layout'
import { ProfileSelector } from '@/components/domain/profile-selector'
import { StatCard, StatCardGrid } from '@/components/ui/stat-card'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Upload, TrendingUp, Wallet, CreditCard, Banknote } from 'lucide-react'
import { PREFERENCE_KEYS } from '@/lib/api'
import { getSummary, getAccounts, getMonthTransactions, getSubscriptions } from '@/lib/api'
import type { MonthlyTrendData } from '@/lib/api'

import {
  type DashboardTimeframeSelection,
  DEFAULT_TIMEFRAME_SELECTION,
  CHART_TIMEFRAME_OPTIONS,
  formatCompact,
  getFinancialYearRange,
  getCalendarMonthRange,
  parseSavedTimeframe,
  DashboardTimeframePicker,
  IncomeExpensesCard,
  SpendingByCategoryCard,
  IncomeByCategoryCard,
  SubscriptionsCard,
  AccountBalancesCard,
  MonthDetailModal,
} from '@/components/dashboard'

export const Route = createFileRoute('/')({
  component: DashboardPage,
})

function DashboardPage() {
  const { user, isAuthenticated } = useAuth()
  const {
    activeProfileId: profileId,
    showFamilyView,
    selectorProfileId,
    handleProfileChange,
    handleFamilyViewChange,
  } = useProfileSelection()
  const [selectedMonth, setSelectedMonth] = useState<MonthlyTrendData | null>(null)

  // Fetch user-wide preferences (not profile-specific)
  const { data: preferences, isLoading: preferencesLoading } = usePreferences(
    undefined,
    isAuthenticated
  )
  const setPreferenceMutation = useSetPreference()

  // Dashboard-wide timeframe: one selection drives every date-based widget.
  // The last selection is remembered as a user preference.
  const [timeframeOverride, setTimeframeOverride] = useState<DashboardTimeframeSelection | null>(
    null
  )
  const savedTimeframe = useMemo(
    () => parseSavedTimeframe(preferences?.[PREFERENCE_KEYS.DASHBOARD_CHART_TIMEFRAME]),
    [preferences]
  )
  const timeframeSelection = timeframeOverride ?? savedTimeframe ?? DEFAULT_TIMEFRAME_SELECTION
  const { timeframe: dashboardTimeframe, customDateRange } = timeframeSelection

  const handleTimeframeChange = useCallback(
    (selection: DashboardTimeframeSelection) => {
      setTimeframeOverride(selection)
      setPreferenceMutation.mutate({
        key: PREFERENCE_KEYS.DASHBOARD_CHART_TIMEFRAME,
        value: JSON.stringify(selection),
      })
    },
    [setPreferenceMutation]
  )

  // Spending by Category state
  const [showMonthlyAverage, setShowMonthlyAverage] = useState(false)

  const selectedTimeframeLabel =
    CHART_TIMEFRAME_OPTIONS.find((t) => t.key === dashboardTimeframe)?.label ?? ''

  // Calculate chart date range from the shared timeframe
  const chartDateOptions = useMemo(() => {
    const option = CHART_TIMEFRAME_OPTIONS.find((t) => t.key === dashboardTimeframe)

    if (dashboardTimeframe === 'custom' && customDateRange) {
      return { startDate: customDateRange.startDate, endDate: customDateRange.endDate }
    }
    if (option?.monthOffset !== undefined) {
      return getCalendarMonthRange(option.monthOffset)
    }
    if (dashboardTimeframe === 'current_fy') {
      const fy = getFinancialYearRange(user?.country, 0)
      return { startDate: fy.startDate, endDate: fy.endDate }
    }
    if (dashboardTimeframe === 'last_fy') {
      const fy = getFinancialYearRange(user?.country, -1)
      return { startDate: fy.startDate, endDate: fy.endDate }
    }
    return { months: option?.months || 12 }
  }, [dashboardTimeframe, customDateRange, user?.country])

  // Calculate category date range from the same shared timeframe
  const categoryDateOptions = useMemo(() => {
    if ('startDate' in chartDateOptions) return chartDateOptions

    const months = chartDateOptions.months
    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
    return {
      startDate: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-01`,
      endDate: now.toISOString().split('T')[0],
    }
  }, [chartDateOptions])

  // Calculate total months for monthly average
  const categoryTotalMonths = useMemo(() => {
    if (categoryDateOptions.startDate && categoryDateOptions.endDate) {
      const start = new Date(categoryDateOptions.startDate)
      const end = new Date(categoryDateOptions.endDate)
      return Math.max(
        1,
        (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
      )
    }
    return 12
  }, [categoryDateOptions])

  // Fetch categories (only when authenticated)
  const { data: categoriesData } = useCategories(isAuthenticated)
  const categories = useMemo(() => categoriesData?.categories || [], [categoriesData?.categories])

  // Query enabled when we have a profileId OR we're in family view
  const queryEnabled = isAuthenticated && (!!profileId || showFamilyView)
  // Date-based widgets wait for the saved timeframe so they don't fetch the default range first
  const timeframeQueriesEnabled = queryEnabled && !preferencesLoading

  // Category helpers
  const getCategoryLabel = useCallback(
    (code: string) => {
      const cat = categories.find((c) => c.code === code)
      return cat?.label || code.replace(/_/g, ' ')
    },
    [categories]
  )

  const getCategoryColor = useCallback(
    (code: string) => {
      const cat = categories.find((c) => c.code === code)
      return cat?.color || 'zinc'
    },
    [categories]
  )

  // Derive excluded categories from preferences
  const incomeExpensesExcluded = useMemo(() => {
    const prefValue = preferences?.[PREFERENCE_KEYS.INCOME_EXPENSES_EXCLUDED_CATEGORIES]
    if (prefValue) {
      try {
        return JSON.parse(prefValue) as string[]
      } catch {
        return []
      }
    }
    return []
  }, [preferences])

  const spendingByCategoryExcluded = useMemo(() => {
    const prefValue = preferences?.[PREFERENCE_KEYS.SPENDING_BY_CATEGORY_EXCLUDED_CATEGORIES]
    if (prefValue) {
      try {
        return JSON.parse(prefValue) as string[]
      } catch {
        return []
      }
    }
    return []
  }, [preferences])

  // Toggle handlers (user-wide preferences, not profile-specific)
  const toggleIncomeExpensesExclusion = useCallback(
    (categoryCode: string) => {
      const newExcluded = incomeExpensesExcluded.includes(categoryCode)
        ? incomeExpensesExcluded.filter((c) => c !== categoryCode)
        : [...incomeExpensesExcluded, categoryCode]

      setPreferenceMutation.mutate({
        key: PREFERENCE_KEYS.INCOME_EXPENSES_EXCLUDED_CATEGORIES,
        value: JSON.stringify(newExcluded),
      })
    },
    [incomeExpensesExcluded, setPreferenceMutation]
  )

  const clearIncomeExpensesExclusions = useCallback(() => {
    setPreferenceMutation.mutate({
      key: PREFERENCE_KEYS.INCOME_EXPENSES_EXCLUDED_CATEGORIES,
      value: JSON.stringify([]),
    })
  }, [setPreferenceMutation])

  const toggleSpendingByCategoryExclusion = useCallback(
    (categoryCode: string) => {
      const newExcluded = spendingByCategoryExcluded.includes(categoryCode)
        ? spendingByCategoryExcluded.filter((c) => c !== categoryCode)
        : [...spendingByCategoryExcluded, categoryCode]

      setPreferenceMutation.mutate({
        key: PREFERENCE_KEYS.SPENDING_BY_CATEGORY_EXCLUDED_CATEGORIES,
        value: JSON.stringify(newExcluded),
      })
    },
    [spendingByCategoryExcluded, setPreferenceMutation]
  )

  const clearSpendingByCategoryExclusions = useCallback(() => {
    setPreferenceMutation.mutate({
      key: PREFERENCE_KEYS.SPENDING_BY_CATEGORY_EXCLUDED_CATEGORIES,
      value: JSON.stringify([]),
    })
  }, [setPreferenceMutation])

  // Fetch summary
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: [
      'summary',
      profileId ?? 'family',
      categoryDateOptions.startDate,
      categoryDateOptions.endDate,
    ],
    queryFn: () =>
      getSummary(profileId, {
        startDate: categoryDateOptions.startDate,
        endDate: categoryDateOptions.endDate,
      }),
    enabled: timeframeQueriesEnabled,
  })

  // Fetch accounts
  const { data: accounts } = useQuery({
    queryKey: ['accounts', profileId ?? 'family'],
    queryFn: () => getAccounts(profileId),
    enabled: queryEnabled,
  })

  // Fetch monthly trends
  const trendsOptions = useMemo(
    () => ({
      ...chartDateOptions,
      excludeCategories: incomeExpensesExcluded.length > 0 ? incomeExpensesExcluded : undefined,
      enabled: timeframeQueriesEnabled,
    }),
    [chartDateOptions, incomeExpensesExcluded, timeframeQueriesEnabled]
  )
  const { data: trendsData, isLoading: trendsLoading } = useMonthlyTrends(profileId, trendsOptions)

  // Calculate 3-month average expenses (for when current month has no data)
  const threeMonthAvgExpenses = useMemo(() => {
    if (!trendsData?.trends || trendsData.trends.length === 0) return null

    // Get the current month in YYYY-MM format
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    // Filter out current month and months with no expenses
    const monthsWithExpenses = trendsData.trends.filter(
      (t) => t.month !== currentMonth && t.expenses > 0
    )

    if (monthsWithExpenses.length === 0) return null

    // Find the most recent month with full data (has transaction in last 5 days)
    // This ensures we don't include partial months in the average
    let lastFullMonthIndex = monthsWithExpenses.length - 1
    while (lastFullMonthIndex >= 0 && !monthsWithExpenses[lastFullMonthIndex]!.hasFullData) {
      lastFullMonthIndex--
    }

    if (lastFullMonthIndex < 0) return null

    // Take up to 3 months ending at the last full month
    const startIndex = Math.max(0, lastFullMonthIndex - 2)
    const selectedMonths = monthsWithExpenses.slice(startIndex, lastFullMonthIndex + 1)

    const total = selectedMonths.reduce((sum, t) => sum + t.expenses, 0)
    return {
      average: total / selectedMonths.length,
      monthCount: selectedMonths.length,
    }
  }, [trendsData])

  // Fetch month transactions for modal
  const { data: monthTransactionsData, isLoading: monthTransactionsLoading } = useQuery({
    queryKey: [
      'month-transactions',
      profileId ?? 'family',
      selectedMonth?.month,
      incomeExpensesExcluded,
    ],
    queryFn: () =>
      getMonthTransactions(
        profileId,
        selectedMonth!.month,
        incomeExpensesExcluded.length > 0 ? incomeExpensesExcluded : undefined
      ),
    enabled: queryEnabled && !!selectedMonth,
  })

  // Fetch category stats
  const categoryStatsFilters = useMemo(
    () => ({
      profileId: profileId,
      startDate: categoryDateOptions.startDate,
      endDate: categoryDateOptions.endDate,
      enabled: timeframeQueriesEnabled,
    }),
    [profileId, categoryDateOptions, timeframeQueriesEnabled]
  )
  const { data: categoryStatsRaw, isLoading: categoryStatsLoading } =
    useTransactionStats(categoryStatsFilters)

  // Filter category stats
  const categoryStats = useMemo(() => {
    if (!categoryStatsRaw) return undefined

    const filteredBreakdown = categoryStatsRaw.categoryBreakdown.filter(
      (cat) => !spendingByCategoryExcluded.includes(cat.category)
    )
    const filteredTotal = filteredBreakdown.reduce((sum, cat) => sum + cat.total, 0)

    return {
      ...categoryStatsRaw,
      categoryBreakdown: filteredBreakdown,
      totalDebits: filteredTotal,
    }
  }, [categoryStatsRaw, spendingByCategoryExcluded])

  // Fetch subscriptions
  const { data: subscriptionsData, isLoading: subscriptionsLoading } = useQuery({
    queryKey: ['subscriptions', profileId ?? 'family'],
    queryFn: () => getSubscriptions(profileId),
    enabled: queryEnabled,
  })

  // Handlers
  const handleMonthClick = useCallback((month: MonthlyTrendData) => {
    setSelectedMonth(month)
  }, [])

  // Link a card to the exact categories its total is built from (refunds and
  // reversals included), so the transactions page's net amount equals the card
  const categoriesLink = (breakdown?: { category: string }[]) =>
    breakdown?.length
      ? {
          category: breakdown.map((c) => c.category).join(','),
          startDate: categoryDateOptions.startDate,
          endDate: categoryDateOptions.endDate,
        }
      : undefined

  const accountsCount = accounts?.length || 0
  const allAccounts = summary
    ? [
        ...summary.netWorth.breakdown.cash.accounts,
        ...summary.netWorth.breakdown.liabilities.creditCards.accounts,
      ]
    : []
  const hasData = summary && (allAccounts.length > 0 || accountsCount > 0)

  return (
    <AppLayout>
      <PageHeader
        title="Dashboard"
        description="Your financial overview"
        actions={
          <div className="flex items-center gap-2">
            <DashboardTimeframePicker
              selection={timeframeSelection}
              onChange={handleTimeframeChange}
              userCountry={user?.country}
            />
            <ProfileSelector
              selectedProfileId={selectorProfileId}
              onProfileChange={handleProfileChange}
              showFamilyView={showFamilyView}
              onFamilyViewChange={handleFamilyViewChange}
            />
          </div>
        }
      />

      {/* Main Stats Grid */}
      <StatCardGrid className="mb-6">
        <StatCard
          label="Net Worth"
          value={summary?.netWorth.total}
          currency={summary?.netWorth.currency}
          subtitle={
            summary
              ? `${formatCompact(summary.netWorth.totalAssets, summary.netWorth.currency)} assets - ${formatCompact(summary.netWorth.totalLiabilities, summary.netWorth.currency)} liabilities`
              : 'Across all accounts'
          }
          icon={Banknote}
          loading={summaryLoading}
          trend={summary?.netWorth.total ? (summary.netWorth.total > 0 ? 'up' : 'down') : undefined}
        />
        <StatCard
          label="Income"
          value={summary?.transactions.totalIncome}
          currency={summary?.transactions.currency}
          subtitle={
            summary?.transactions.incomeCount
              ? `${summary.transactions.incomeCount} transactions · ${selectedTimeframeLabel}`
              : selectedTimeframeLabel
          }
          icon={Wallet}
          loading={summaryLoading}
          transactionsLink={categoriesLink(summary?.transactions.incomeBreakdown)}
        />
        <StatCard
          label="Expenses"
          value={
            summary?.transactions.totalExpenses && summary.transactions.totalExpenses > 0
              ? summary.transactions.totalExpenses
              : threeMonthAvgExpenses?.average
          }
          currency={summary?.transactions.currency || trendsData?.currency}
          subtitle={
            summary?.transactions.totalExpenses && summary.transactions.totalExpenses > 0
              ? summary.transactions.expenseCount
                ? `${summary.transactions.expenseCount} transactions · ${selectedTimeframeLabel}`
                : selectedTimeframeLabel
              : threeMonthAvgExpenses
                ? `${threeMonthAvgExpenses.monthCount}-month average`
                : selectedTimeframeLabel
          }
          icon={CreditCard}
          loading={summaryLoading || trendsLoading}
          transactionsLink={categoriesLink(summary?.transactions.categoryBreakdown)}
        />
        <StatCard
          label="Investments"
          value={summary?.transactions.investedAmount}
          currency={summary?.transactions.currency}
          subtitle={`Invested · ${selectedTimeframeLabel}`}
          icon={TrendingUp}
          loading={summaryLoading}
          transactionsLink={{
            category: 'investment',
            startDate: categoryDateOptions.startDate,
            endDate: categoryDateOptions.endDate,
          }}
        />
      </StatCardGrid>

      {/* Income vs Expenses Chart */}
      <IncomeExpensesCard
        trendsData={trendsData}
        isLoading={trendsLoading}
        excludedCategories={incomeExpensesExcluded}
        onToggleExclusion={toggleIncomeExpensesExclusion}
        onClearExclusions={clearIncomeExpensesExclusions}
        categories={categories}
        onMonthClick={handleMonthClick}
      />

      {/* Spending by Category & Subscriptions Row */}
      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <SpendingByCategoryCard
          categoryStats={categoryStats}
          isLoading={categoryStatsLoading}
          showMonthlyAverage={showMonthlyAverage}
          onShowMonthlyAverageChange={setShowMonthlyAverage}
          totalMonths={categoryTotalMonths}
          excludedCategories={spendingByCategoryExcluded}
          onToggleExclusion={toggleSpendingByCategoryExclusion}
          onClearExclusions={clearSpendingByCategoryExclusions}
          categories={categories}
          getCategoryLabel={getCategoryLabel}
          getCategoryColor={getCategoryColor}
          startDate={categoryDateOptions.startDate}
          endDate={categoryDateOptions.endDate}
        />

        <IncomeByCategoryCard
          incomeBreakdown={categoryStatsRaw?.incomeBreakdown}
          totalIncome={categoryStatsRaw?.totalIncome ?? 0}
          currency={categoryStatsRaw?.currency ?? 'INR'}
          isLoading={categoryStatsLoading}
          showMonthlyAverage={showMonthlyAverage}
          onShowMonthlyAverageChange={setShowMonthlyAverage}
          totalMonths={categoryTotalMonths}
          getCategoryLabel={getCategoryLabel}
          getCategoryColor={getCategoryColor}
          startDate={categoryDateOptions.startDate}
          endDate={categoryDateOptions.endDate}
        />
      </div>

      {/* Subscriptions */}
      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <SubscriptionsCard
          subscriptions={subscriptionsData?.subscriptions || []}
          totalMonthly={subscriptionsData?.totalMonthly || 0}
          currency={subscriptionsData?.currency || 'INR'}
          getCategoryLabel={getCategoryLabel}
          isLoading={subscriptionsLoading}
          countryCode={user?.country?.toLowerCase() || 'in'}
        />
      </div>

      {/* Account Balances */}
      <AccountBalancesCard accounts={allAccounts} />

      {/* Empty State */}
      {!summaryLoading && !hasData && (
        <EmptyState
          icon={Upload}
          title="Get started with Moneywright"
          description="Upload your bank statements or credit card statements to unlock powerful financial insights and track your spending automatically."
          action={{
            label: 'Upload Your First Statement',
            href: '/statements?upload=true',
            icon: Upload,
          }}
          size="lg"
        />
      )}

      {/* Month Detail Modal */}
      <MonthDetailModal
        month={selectedMonth}
        data={monthTransactionsData}
        isLoading={monthTransactionsLoading}
        getCategoryLabel={getCategoryLabel}
        onClose={() => setSelectedMonth(null)}
      />
    </AppLayout>
  )
}
