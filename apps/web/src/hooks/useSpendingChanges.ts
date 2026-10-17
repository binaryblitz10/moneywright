import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getSpendingChanges } from '@/lib/api'

import type { SpendingChangesParams } from '@/lib/api'

// Query Keys
export const spendingChangesKeys = {
  all: ['spendingChanges'] as const,
  detail: (params: SpendingChangesParams) =>
    [
      ...spendingChangesKeys.all,
      params.profileId ?? 'family',
      params.month ?? 'latest',
      params.baselineMonths,
    ] as const,
}

/**
 * Fetch spending changes for a month vs the average of previous months
 * Omit month for the latest complete month with data; undefined profileId is family view
 */
export function useSpendingChanges(params: SpendingChangesParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: spendingChangesKeys.detail(params),
    queryFn: () => getSpendingChanges(params),
    enabled: options?.enabled ?? true,
    // Keep the previous month on screen while the next one loads
    placeholderData: keepPreviousData,
  })
}
