import { useState, useMemo, useCallback } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  useAuth,
  useCategories,
  useMonthlyTrends,
  usePreferences,
  useSetPreference,
  useProfileSelection,
  useDashboardWidgets,
} from '@/hooks'
import { AppLayout } from '@/components/domain/app-layout'
import { ProfileSelector } from '@/components/domain/profile-selector'
import { StatCard, StatCardGrid } from '@/components/ui/stat-card'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Upload,
  TrendingUp,
  Wallet,
  CreditCard,
  Banknote,
  PiggyBank,
  LayoutGrid,
} from 'lucide-react'
import { PREFERENCE_KEYS } from '@/lib/api'
import { getSummary, getAccounts, getMonthTransactions, getSubscriptions } from '@/lib/api'
import type { MonthlyTrendData } from '@/lib/api'
import { DASHBOARD_WIDGETS, type DashboardWidgetId } from '@/lib/dashboard-widgets'
import { getRangeLabel } from '@/lib/date-presets'
import { cn } from '@/lib/utils'

import {
  type DashboardTimeframeSelection,
  type DateRange,
  DEFAULT_TIMEFRAME_SELECTION,
  formatCompact,
  formatCurrency,
  getTimeframeDateRange,
  parseSavedTimeframe,
  DashboardTimeframePicker,
  IncomeExpensesCard,
  WhatChangedCard,
  SpendingByCategoryCard,
  IncomeByCategoryCard,
  SubscriptionsCard,
  AccountBalancesCard,
  MonthDetailModal,
} from '@/components/dashboard'

export const Route = createFileRoute('/')({
  component: DashboardPage,
})

/** Stat grid columns for the number of visible cards, so hidden cards leave no gaps */
const STAT_GRID_COLUMNS: Record<number, string> = {
  1: 'md:grid-cols-1 lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-2 xl:grid-cols-4',
  5: 'lg:grid-cols-2 xl:grid-cols-5',
}

/**
 * Elapsed months between two YYYY-MM-DD dates, for the "/mo" averages.
 * Whole calendar months from the start month to the end month, plus the end
 * month counted pro-rata by the day of endDate. Minimum 1.
 * e.g. 2026-01-01..2026-12-31 = 12, 2026-01-01..2026-10-16 = 9 + 16/31 ≈ 9.52
 */
function getElapsedMonths(range: DateRange): number {
  const [startYear = 0, startMonth = 1] = range.startDate.split('-').map(Number)
  const [endYear = 0, endMonth = 1, endDay = 1] = range.endDate.split('-').map(Number)
  const daysInEndMonth = new Date(endYear, endMonth, 0).getDate()
  const wholeMonths = (endYear - startYear) * 12 + (endMonth - startMonth)
  return Math.max(1, wholeMonths + endDay / daysInEndMonth)
}

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

  // Widgets switched off in Settings stay hidden; nothing shows until the choice is known
  const { isVisible } = useDashboardWidgets(isAuthenticated)
  const show = (id: DashboardWidgetId) => !preferencesLoading && isVisible(id)

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
    dashboardTimeframe === 'custom'
      ? getRangeLabel(customDateRange ?? {}, user?.country, null)
      : getRangeLabel({}, user?.country, dashboardTimeframe)

  // Explicit date range from the shared timeframe, used by every date-based widget
  const dateRange = useMemo(
    (): DateRange =>
      customDateRange && dashboardTimeframe === 'custom'
        ? { startDate: customDateRange.startDate, endDate: customDateRange.endDate }
        : getTimeframeDateRange(dashboardTimeframe, user?.country)!,
    [dashboardTimeframe, customDateRange, user?.country]
  )

  // Total months for the "/mo" averages
  const categoryTotalMonths = useMemo(() => getElapsedMonths(dateRange), [dateRange])

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

  // Fetch summary
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['summary', profileId ?? 'family', dateRange.startDate, dateRange.endDate],
    queryFn: () =>
      getSummary(profileId, {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
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
  const { data: trendsData, isLoading: trendsLoading } = useMonthlyTrends(profileId, {
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    enabled: timeframeQueriesEnabled && show('income_vs_expenses'),
  })

  // Fetch month transactions for modal
  const { data: monthTransactionsData, isLoading: monthTransactionsLoading } = useQuery({
    queryKey: [
      'month-transactions',
      profileId ?? 'family',
      selectedMonth?.month,
      dateRange.startDate,
      dateRange.endDate,
    ],
    queryFn: () =>
      getMonthTransactions(profileId, selectedMonth!.month, {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      }),
    enabled: queryEnabled && !!selectedMonth,
  })

  // Fetch subscriptions
  const { data: subscriptionsData, isLoading: subscriptionsLoading } = useQuery({
    queryKey: ['subscriptions', profileId ?? 'family'],
    queryFn: () => getSubscriptions(profileId),
    enabled: queryEnabled && show('subscriptions'),
  })

  // Handlers
  const handleMonthClick = useCallback((month: MonthlyTrendData) => {
    setSelectedMonth(month)
  }, [])

  // Savings rate = (income - expenses) / income; call out when investing exceeded the surplus
  const savingsRate = summary?.transactions.savingsRate
  const savingsSubtitle = (() => {
    const t = summary?.transactions
    if (!t) return selectedTimeframeLabel
    if (t.savingsRate === null) return `No income · ${selectedTimeframeLabel}`
    if (t.surplus < 0) {
      return `${formatCurrency(-t.surplus, t.currency)} overspent · ${selectedTimeframeLabel}`
    }
    return t.investedAmount > t.surplus
      ? `Invested ${formatCurrency(t.investedAmount - t.surplus, t.currency)} more than saved`
      : `${formatCurrency(t.surplus, t.currency)} saved · ${selectedTimeframeLabel}`
  })()

  // Link a card to the exact categories its total is built from (refunds and
  // reversals included), so the transactions page's net amount equals the card
  const categoriesLink = (breakdown?: { category: string }[]) =>
    breakdown?.length
      ? {
          category: breakdown.map((c) => c.category).join(','),
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        }
      : undefined

  const transactionCountSubtitle = (count: number | undefined) =>
    count ? `${count} transactions · ${selectedTimeframeLabel}` : selectedTimeframeLabel

  const investedAmount = summary?.transactions.investedAmount
  const accountsCount = accounts?.length || 0
  const allAccounts = summary
    ? [
        ...summary.netWorth.breakdown.cash.accounts,
        ...summary.netWorth.breakdown.liabilities.creditCards.accounts,
      ]
    : []
  const hasData = summary && (allAccounts.length > 0 || accountsCount > 0)

  const statCardCount = DASHBOARD_WIDGETS.filter((w) => w.group === 'cards' && show(w.id)).length
  const showCategoryCards = show('spending_by_category') || show('income_by_category')
  const allWidgetsHidden = !preferencesLoading && DASHBOARD_WIDGETS.every((w) => !isVisible(w.id))

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
      {statCardCount > 0 && (
        <StatCardGrid className={cn('mb-6', STAT_GRID_COLUMNS[statCardCount])}>
          {show('net_worth') && (
            <StatCard
              label="Net Worth"
              formatValue={formatCurrency}
              value={summary?.netWorth.total}
              currency={summary?.netWorth.currency}
              subtitle={
                summary
                  ? `${formatCompact(summary.netWorth.totalAssets, summary.netWorth.currency)} assets - ${formatCompact(summary.netWorth.totalLiabilities, summary.netWorth.currency)} liabilities`
                  : 'Across all accounts'
              }
              icon={Banknote}
              loading={summaryLoading}
            />
          )}
          {show('income') && (
            <StatCard
              label="Income"
              formatValue={formatCurrency}
              value={summary?.transactions.totalIncome}
              currency={summary?.transactions.currency}
              subtitle={transactionCountSubtitle(summary?.transactions.incomeCount)}
              icon={Wallet}
              loading={summaryLoading}
              transactionsLink={categoriesLink(summary?.transactions.incomeBreakdown)}
            />
          )}
          {show('expenses') && (
            <StatCard
              label="Expenses"
              formatValue={formatCurrency}
              value={summary?.transactions.totalExpenses}
              currency={summary?.transactions.currency}
              subtitle={transactionCountSubtitle(summary?.transactions.expenseCount)}
              icon={CreditCard}
              loading={summaryLoading}
              transactionsLink={categoriesLink(summary?.transactions.categoryBreakdown)}
            />
          )}
          {show('savings_rate') && (
            <StatCard
              label="Savings Rate"
              value={
                savingsRate === null || savingsRate === undefined ? undefined : savingsRate * 100
              }
              formatValue={(rate) => `${Math.round(rate)}%`}
              subtitle={savingsSubtitle}
              icon={PiggyBank}
              loading={summaryLoading}
            />
          )}
          {show('investments') && (
            <StatCard
              label="Investments"
              formatValue={formatCurrency}
              value={investedAmount === undefined ? undefined : Math.abs(investedAmount)}
              currency={summary?.transactions.currency}
              subtitle={
                investedAmount !== undefined && investedAmount < 0
                  ? `Net withdrawn · ${selectedTimeframeLabel}`
                  : `Invested · ${selectedTimeframeLabel}`
              }
              icon={TrendingUp}
              loading={summaryLoading}
              transactionsLink={{
                category: 'investment',
                startDate: dateRange.startDate,
                endDate: dateRange.endDate,
              }}
            />
          )}
        </StatCardGrid>
      )}

      {/* Income vs Expenses Chart */}
      {show('income_vs_expenses') && (
        <IncomeExpensesCard
          trendsData={trendsData}
          isLoading={trendsLoading}
          onMonthClick={handleMonthClick}
          getCategoryLabel={getCategoryLabel}
        />
      )}

      {/* Spending by Category & Income by Category Row */}
      {showCategoryCards && (
        <div
          className={cn(
            'grid gap-4 mb-6',
            show('spending_by_category') && show('income_by_category') && 'lg:grid-cols-2'
          )}
        >
          {show('spending_by_category') && (
            <SpendingByCategoryCard
              categoryStats={
                summary
                  ? {
                      categoryBreakdown: summary.transactions.categoryBreakdown,
                      totalDebits: summary.transactions.totalExpenses,
                      currency: summary.transactions.currency,
                    }
                  : undefined
              }
              isLoading={summaryLoading}
              showMonthlyAverage={showMonthlyAverage}
              onShowMonthlyAverageChange={setShowMonthlyAverage}
              totalMonths={categoryTotalMonths}
              getCategoryLabel={getCategoryLabel}
              getCategoryColor={getCategoryColor}
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
              previousPeriod={summary?.transactions.previousPeriod}
            />
          )}

          {show('income_by_category') && (
            <IncomeByCategoryCard
              incomeBreakdown={summary?.transactions.incomeBreakdown}
              totalIncome={summary?.transactions.totalIncome ?? 0}
              currency={summary?.transactions.currency ?? 'INR'}
              isLoading={summaryLoading}
              showMonthlyAverage={showMonthlyAverage}
              onShowMonthlyAverageChange={setShowMonthlyAverage}
              totalMonths={categoryTotalMonths}
              getCategoryLabel={getCategoryLabel}
              getCategoryColor={getCategoryColor}
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
            />
          )}
        </div>
      )}

      {/* What Changed (has its own month, ignores the timeframe picker) & Subscriptions */}
      {(show('what_changed') || show('subscriptions')) && (
        <div
          className={cn(
            'grid gap-4 mb-6',
            show('what_changed') && show('subscriptions') && 'lg:grid-cols-2'
          )}
        >
          {show('what_changed') && (
            <WhatChangedCard
              profileId={profileId}
              enabled={queryEnabled}
              getCategoryLabel={getCategoryLabel}
            />
          )}

          {show('subscriptions') && (
            <SubscriptionsCard
              className="h-full"
              subscriptions={subscriptionsData?.subscriptions || []}
              totalMonthly={subscriptionsData?.totalMonthly || 0}
              currency={subscriptionsData?.currency || 'INR'}
              getCategoryLabel={getCategoryLabel}
              isLoading={subscriptionsLoading}
              countryCode={user?.country?.toLowerCase() || 'in'}
            />
          )}
        </div>
      )}

      {/* Account Balances */}
      {show('account_balances') && <AccountBalancesCard accounts={allAccounts} />}

      {/* Every widget switched off in Settings */}
      {allWidgetsHidden && hasData && (
        <EmptyState
          icon={LayoutGrid}
          title="All dashboard widgets are hidden"
          description="Turn widgets back on in Settings to see them here."
          action={{ label: 'Open Settings', href: '/settings' }}
          size="lg"
        />
      )}

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
        startDate={dateRange.startDate}
        endDate={dateRange.endDate}
        onClose={() => setSelectedMonth(null)}
      />
    </AppLayout>
  )
}
