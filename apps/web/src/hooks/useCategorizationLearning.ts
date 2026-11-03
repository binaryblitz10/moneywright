import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getLearnedNotes,
  saveLearnedNotes,
  refreshLearnedNotes,
  resetLearnedNotes,
  getLearningStats,
  searchLearnedMerchants,
  forgetLearnedMerchant,
} from '@/lib/api'
import { useDebounce } from './useDebounce'

// Query Keys
export const categorizationLearningKeys = {
  all: ['categorization-learning'] as const,
  notes: (profileId: string) => [...categorizationLearningKeys.all, 'notes', profileId] as const,
  stats: (profileId: string) => [...categorizationLearningKeys.all, 'stats', profileId] as const,
  merchants: (q: string) => [...categorizationLearningKeys.all, 'merchants', q] as const,
}

/**
 * Fetch the AI-written notes about the user's spending
 */
export function useLearnedNotes(profileId: string | undefined) {
  return useQuery({
    queryKey: categorizationLearningKeys.notes(profileId ?? ''),
    queryFn: () => getLearnedNotes(profileId!),
    enabled: !!profileId,
  })
}

export function useSaveLearnedNotes(profileId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (notes: string) => saveLearnedNotes(profileId!, notes),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: categorizationLearningKeys.notes(profileId!) }),
  })
}

export function useRefreshLearnedNotes(profileId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => refreshLearnedNotes(profileId!),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: categorizationLearningKeys.notes(profileId!) }),
  })
}

export function useResetLearnedNotes(profileId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => resetLearnedNotes(profileId!),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: categorizationLearningKeys.notes(profileId!) }),
  })
}

/**
 * Fetch learning stats (merchants learned, last import, accuracy, corrections)
 */
export function useLearningStats(profileId: string | undefined) {
  return useQuery({
    queryKey: categorizationLearningKeys.stats(profileId ?? ''),
    queryFn: () => getLearningStats(profileId!),
    enabled: !!profileId,
  })
}

/**
 * Search learned merchants by name (debounced while typing)
 */
export function useLearnedMerchants(q: string, enabled: boolean = true) {
  const debouncedQ = useDebounce(q.trim())
  return useQuery({
    queryKey: categorizationLearningKeys.merchants(debouncedQ),
    queryFn: () => searchLearnedMerchants(debouncedQ),
    enabled: enabled && debouncedQ.length > 0,
    placeholderData: keepPreviousData,
  })
}

export function useForgetMerchant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (fingerprint: string) => forgetLearnedMerchant(fingerprint),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categorizationLearningKeys.all }),
  })
}
