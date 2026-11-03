import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  applyAutoFixes,
  getAutoFixBatches,
  getAutoFixPreview,
  undoAutoFixBatch,
  undoAutoFixChange,
} from '@/lib/api'
import type { ApplyAutoFixInput } from '@/lib/api'
import { invalidateTransactionTotals } from './useTransactions'

export const autoFixKeys = {
  all: ['auto-fix'] as const,
  preview: (profileId?: string) => [...autoFixKeys.all, 'preview', profileId ?? 'family'] as const,
  batches: (profileId?: string) => [...autoFixKeys.all, 'batches', profileId ?? 'family'] as const,
}

/** Fixes change transactions, duplicates, review counts, data health and statements */
function invalidateAfterFix(queryClient: QueryClient): void {
  invalidateTransactionTotals(queryClient)
  queryClient.invalidateQueries({ queryKey: autoFixKeys.all })
}

/** What Fix issues would change, per fixer (fetched fresh each time it is opened) */
export function useAutoFixPreview(profileId: string | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: autoFixKeys.preview(profileId),
    queryFn: () => getAutoFixPreview(profileId),
    enabled,
    staleTime: 0,
  })
}

/** Recent batches of fixes, newest first */
export function useAutoFixBatches(profileId: string | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: autoFixKeys.batches(profileId),
    queryFn: () => getAutoFixBatches(profileId),
    enabled,
  })
}

export function useApplyFixes() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ApplyAutoFixInput) => applyAutoFixes(input),
    onSuccess: () => invalidateAfterFix(queryClient),
  })
}

export function useUndoBatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (batchId: string) => undoAutoFixBatch(batchId),
    onSuccess: () => invalidateAfterFix(queryClient),
  })
}

export function useUndoChange() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (changeId: string) => undoAutoFixChange(changeId),
    onSuccess: () => invalidateAfterFix(queryClient),
  })
}

/** Toast text for an undo, mentioning rows left alone because they were edited since */
export function describeUndo(result: { undone: number; skipped: number }): string {
  const undone = result.undone === 1 ? '1 change undone' : `${result.undone} changes undone`
  if (result.skipped === 0) return undone
  const skipped =
    result.skipped === 1
      ? '1 change was edited since and was left alone'
      : `${result.skipped} changes were edited since and were left alone`
  return result.undone === 0 ? skipped : `${undone}. ${skipped}`
}
