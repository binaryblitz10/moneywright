import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isAxiosError } from 'axios'
import {
  getBudgets,
  getBudgetRange,
  createBudget,
  updateBudget,
  deleteBudget,
  type BudgetInput,
} from '@/lib/api'

// Query Keys
export const budgetKeys = {
  all: ['budgets'] as const,
  list: (profileId: string | undefined, month: string) =>
    [...budgetKeys.all, 'list', profileId, month] as const,
  range: (profileId: string | undefined, startMonth: string, endMonth: string) =>
    [...budgetKeys.all, 'range', profileId, startMonth, endMonth] as const,
}

/**
 * A profile's budgets with spending so far in `month` (YYYY-MM)
 */
export function useBudgets(profileId: string | undefined, month: string) {
  return useQuery({
    queryKey: budgetKeys.list(profileId, month),
    queryFn: () => getBudgets(profileId!, month),
    enabled: !!profileId,
  })
}

/**
 * How a profile's budgets held up in each month from `startMonth` to `endMonth` (YYYY-MM)
 */
export function useBudgetRange(
  profileId: string | undefined,
  startMonth: string,
  endMonth: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: budgetKeys.range(profileId, startMonth, endMonth),
    queryFn: () => getBudgetRange(profileId!, startMonth, endMonth),
    enabled: enabled && !!profileId,
  })
}

/** The server's message for a rejected request, or a fallback */
function failureMessage(error: unknown, fallback: string): string {
  return isAxiosError(error) && error.response?.data?.message
    ? error.response.data.message
    : fallback
}

export function useCreateBudget(profileId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: BudgetInput) => createBudget(profileId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all })
      toast.success('Budget added')
    },
    onError: (error) => toast.error(failureMessage(error, 'Failed to add budget')),
  })
}

export function useUpdateBudget() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateBudget>[1] }) =>
      updateBudget(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all })
      toast.success('Budget updated')
    },
    onError: (error) => toast.error(failureMessage(error, 'Failed to update budget')),
  })
}

export function useDeleteBudget() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteBudget(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.all })
      toast.success('Budget removed')
    },
    onError: (error) => toast.error(failureMessage(error, 'Failed to remove budget')),
  })
}
