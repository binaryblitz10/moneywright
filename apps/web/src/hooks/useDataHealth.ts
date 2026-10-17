import { useQuery } from '@tanstack/react-query'
import { getDataHealth } from '@/lib/api'
import type { DataHealthParams } from '@/lib/api'

export const dataHealthKeys = {
  all: ['data-health'] as const,
  report: (profileId: string | undefined, options: Omit<DataHealthParams, 'profileId'>) =>
    [...dataHealthKeys.all, profileId ?? 'family', options] as const,
}

/**
 * Statement coverage, reconciliation and cash bridge checks for a profile (or family view)
 */
export function useDataHealth(
  profileId: string | undefined,
  options: Omit<DataHealthParams, 'profileId'> & { enabled?: boolean } = {}
) {
  const { enabled = true, ...range } = options
  return useQuery({
    queryKey: dataHealthKeys.report(profileId, range),
    queryFn: () => getDataHealth({ profileId, ...range }),
    enabled,
  })
}
