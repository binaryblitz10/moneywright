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
} from '@/hooks'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { QueryError } from '@/components/ui/query-error'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileBarChart, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  IncomeFlowView,
  InvestmentsReportView,
  MONTH_PATTERN,
  PeriodPicker,
  PeriodReportView,
  ReportSkeleton,
  comparisonRange,
  formatRange,
  resolveRange,
  type MonthRange,
  type ReportTab,
} from '@/components/reports'

const REPORT_TABS = ['period', 'income-flow', 'investments'] as const

const monthParam = z.string().regex(MONTH_PATTERN).optional().catch(undefined)

const searchSchema = z.object({
  tab: z.enum(REPORT_TABS).catch('period'),
  from: monthParam,
  to: monthParam,
})

export const Route = createFileRoute('/_app/reports')({
  component: ReportsPage,
  validateSearch: searchSchema,
})

function ReportsPage() {
  const navigate = useNavigate({ from: '/reports' })
  const { tab, from, to } = Route.useSearch()
  const { isAuthenticated, user } = useAuth()
  const { activeProfileId: profileId, showFamilyView } = useProfileSelection()

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
    refetch: refetchBounds,
  } = useReportBounds(profileId, queryEnabled)
  const range = useMemo(() => (bounds ? resolveRange(from, to, bounds) : null), [bounds, from, to])
  const comparison = useMemo(
    () => (bounds && range ? comparisonRange(range, bounds) : null),
    [bounds, range]
  )
  const params = range ? { profileId, ...range } : undefined

  const period = usePeriodReport(params, tab === 'period' || tab === 'income-flow')
  const investments = useInvestmentsReport(params, tab === 'investments')

  // The router cross-fades pages with a view transition, which freezes the page for a moment.
  // Changing the months or tab stays on the same page, so it skips that.
  const setRange = (next: MonthRange) =>
    navigate({ search: { tab, ...next }, replace: true, viewTransition: false })
  const setTab = (next: string) =>
    navigate({
      search: { tab: next as ReportTab, from, to },
      replace: true,
      viewTransition: false,
    })

  const description = range
    ? comparison
      ? `${formatRange(range)} compared with ${formatRange(comparison)}`
      : `${formatRange(range)}, no earlier data to compare`
    : 'Your money, month by month'

  return (
    <>
      <PageHeader
        title="Reports"
        description={description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {bounds && range && (
              <PeriodPicker
                range={range}
                bounds={bounds}
                userCountry={user?.country}
                onChange={setRange}
              />
            )}
          </div>
        }
      />

      {boundsError ? (
        <QueryError error={boundsError} onRetry={refetchBounds} />
      ) : boundsLoading || !bounds ? (
        <ReportSkeleton />
      ) : !range ? (
        <EmptyState
          icon={FileBarChart}
          title="No finished months to report on yet"
          description="Upload a statement to see your reports."
          action={{ label: 'Upload a statement', href: '/statements?upload=true', icon: Upload }}
          size="lg"
        />
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="gap-4">
          <TabsList className="w-full sm:w-fit">
            <TabsTrigger value="period">Period report</TabsTrigger>
            <TabsTrigger value="income-flow">Income flow</TabsTrigger>
            <TabsTrigger value="investments">Investments</TabsTrigger>
          </TabsList>

          <TabsContent value="period">
            <QueryBody query={period}>
              {(report) => <PeriodReportView report={report} getCategoryColor={getCategoryColor} />}
            </QueryBody>
          </TabsContent>
          <TabsContent value="income-flow">
            <QueryBody query={period}>
              {(report) => <IncomeFlowView report={report} getCategoryColor={getCategoryColor} />}
            </QueryBody>
          </TabsContent>
          <TabsContent value="investments">
            <QueryBody query={investments}>
              {(report) => <InvestmentsReportView report={report} />}
            </QueryBody>
          </TabsContent>
        </Tabs>
      )}
    </>
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
  if (query.error && !query.data) return <QueryError error={query.error} onRetry={query.refetch} />
  if (!query.data) return <ReportSkeleton />
  return (
    <div className={cn('transition-opacity', query.isPlaceholderData && 'opacity-50')}>
      {children(query.data)}
    </div>
  )
}
