import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  getInvestmentsReport,
  getPeriodReport,
  getReportBounds,
  getTrendsReport,
  type ReportRangeParams,
} from '@/lib/api'

// Query Keys
export const reportKeys = {
  all: ['reports'] as const,
  bounds: (profileId?: string) => [...reportKeys.all, 'months', profileId ?? 'family'] as const,
  period: (params: ReportRangeParams) =>
    [...reportKeys.all, 'period', params.profileId ?? 'family', params.from, params.to] as const,
  trends: (params: ReportRangeParams) =>
    [...reportKeys.all, 'trends', params.profileId ?? 'family', params.from, params.to] as const,
  investments: (params: ReportRangeParams) =>
    [
      ...reportKeys.all,
      'investments',
      params.profileId ?? 'family',
      params.from,
      params.to,
    ] as const,
}

/** The months a report can cover; undefined profileId is family view */
export function useReportBounds(profileId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: reportKeys.bounds(profileId),
    queryFn: () => getReportBounds(profileId),
    enabled,
  })
}

/** Period report for complete months; params are undefined until the months are known */
export function usePeriodReport(params: ReportRangeParams | undefined, enabled = true) {
  return useQuery({
    queryKey: reportKeys.period(params ?? { from: '', to: '' }),
    queryFn: () => getPeriodReport(params!),
    enabled: enabled && !!params,
    // Keep the previous months on screen while the next ones load
    placeholderData: keepPreviousData,
  })
}

export function useTrendsReport(params: ReportRangeParams | undefined, enabled = true) {
  return useQuery({
    queryKey: reportKeys.trends(params ?? { from: '', to: '' }),
    queryFn: () => getTrendsReport(params!),
    enabled: enabled && !!params,
    placeholderData: keepPreviousData,
  })
}

export function useInvestmentsReport(params: ReportRangeParams | undefined, enabled = true) {
  return useQuery({
    queryKey: reportKeys.investments(params ?? { from: '', to: '' }),
    queryFn: () => getInvestmentsReport(params!),
    enabled: enabled && !!params,
    placeholderData: keepPreviousData,
  })
}
