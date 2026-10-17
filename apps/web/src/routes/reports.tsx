import { useCallback, useMemo, type ReactNode } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import type { UseQueryResult } from '@tanstack/react-query'
import { z } from 'zod'
import {
  useAuth,
  useCategories,
  useInvestmentsReport,
  usePeriodReport,
  useProfileSelection,
  useReportBounds,
  useTrendsReport,
} from '@/hooks'
import { AppLayout } from '@/components/domain/app-layout'
import { ProfileSelector } from '@/components/domain/profile-selector'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileBarChart, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  InvestmentsReportView,
  MONTH_PATTERN,
  PeriodPicker,
  PeriodReportView,
  ReportError,
  ReportSkeleton,
  SpendingTrendsView,
  comparisonRange,
  formatRange,
  resolveRange,
  type MonthRange,
  type ReportTab,
} from '@/components/reports'

const REPORT_TABS = ['period', 'trends', 'investments'] as const

const monthParam = z.string().regex(MONTH_PATTERN).optional().catch(undefined)

const searchSchema = z.object({
  tab: z.enum(REPORT_TABS).catch('period'),
  from: monthParam,
  to: monthParam,
})

export const Route = createFileRoute('/reports')({
  component: ReportsPage,
  validateSearch: searchSchema,
})

function ReportsPage() {
  const navigate = useNavigate({ from: '/reports' })
  const { tab, from, to } = Route.useSearch()
  const { isAuthenticated } = useAuth()
  const {
    activeProfileId: profileId,
    showFamilyView,
    selectorProfileId,
    handleProfileChange,
    handleFamilyViewChange,
  } = useProfileSelection()

  const queryEnabled = isAuthenticated && (!!profileId || showFamilyView)

  const { data: categoriesData } = useCategories(isAuthenticated)
  const getCategoryColor = useCallback(
    (code: string) => categoriesData?.categories.find((c) => c.code === code)?.color ?? 'zinc',
    [categoriesData]
  )

  const {
    data: bounds,
    isLoading: boundsLoading,
    error: boundsError,
  } = useReportBounds(profileId, queryEnabled)
  const range = useMemo(() => (bounds ? resolveRange(from, to, bounds) : null), [bounds, from, to])
  const comparison = useMemo(
    () => (bounds && range ? comparisonRange(range, bounds) : null),
    [bounds, range]
  )
  const params = range ? { profileId, ...range } : undefined

  const period = usePeriodReport(params, tab === 'period')
  const trends = useTrendsReport(params, tab === 'trends')
  const investments = useInvestmentsReport(params, tab === 'investments')

  const setRange = (next: MonthRange) => navigate({ search: { tab, ...next }, replace: true })
  const setTab = (next: string) =>
    navigate({ search: { tab: next as ReportTab, from, to }, replace: true })

  const description = range
    ? tab === 'trends'
      ? `${formatRange(range)}, month by month`
      : comparison
        ? `${formatRange(range)} compared with ${formatRange(comparison)}`
        : `${formatRange(range)}, no earlier data to compare`
    : 'Your money, month by month'

  return (
    <AppLayout>
      <PageHeader
        title="Reports"
        description={description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {bounds && range && <PeriodPicker range={range} bounds={bounds} onChange={setRange} />}
            <ProfileSelector
              selectedProfileId={selectorProfileId}
              onProfileChange={handleProfileChange}
              showFamilyView={showFamilyView}
              onFamilyViewChange={handleFamilyViewChange}
            />
          </div>
        }
      />

      {boundsError ? (
        <ReportError error={boundsError} />
      ) : boundsLoading || !bounds ? (
        <ReportSkeleton />
      ) : !range ? (
        <EmptyState
          icon={FileBarChart}
          title="No finished months to report on yet"
          description="Reports cover whole months that are over. Upload statements and come back once a month has finished."
          action={{ label: 'Upload a statement', href: '/statements?upload=true', icon: Upload }}
          size="lg"
        />
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="gap-4">
          <TabsList className="w-full sm:w-fit">
            <TabsTrigger value="period">Period report</TabsTrigger>
            <TabsTrigger value="trends">Spending trends</TabsTrigger>
            <TabsTrigger value="investments">Investments</TabsTrigger>
          </TabsList>

          <TabsContent value="period">
            <QueryBody query={period}>
              {(report) => <PeriodReportView report={report} getCategoryColor={getCategoryColor} />}
            </QueryBody>
          </TabsContent>
          <TabsContent value="trends">
            <QueryBody query={trends}>
              {(report) => (
                <SpendingTrendsView report={report} getCategoryColor={getCategoryColor} />
              )}
            </QueryBody>
          </TabsContent>
          <TabsContent value="investments">
            <QueryBody query={investments}>
              {(report) => <InvestmentsReportView report={report} />}
            </QueryBody>
          </TabsContent>
        </Tabs>
      )}
    </AppLayout>
  )
}

/** Loading, error and the report; the previous report stays faded while the next one loads */
function QueryBody<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>
  children: (data: T) => ReactNode
}) {
  if (query.error && !query.data) return <ReportError error={query.error} />
  if (!query.data) return <ReportSkeleton />
  return (
    <div className={cn('transition-opacity', query.isPlaceholderData && 'opacity-50')}>
      {children(query.data)}
    </div>
  )
}
