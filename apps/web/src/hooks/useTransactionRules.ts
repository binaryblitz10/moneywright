import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getTransactionRules,
  createTransactionRule,
  updateTransactionRule,
  deleteTransactionRule,
  previewTransactionRule,
  type TransactionRuleConditions,
  type TransactionRuleInput,
} from '@/lib/api'
import { transactionKeys } from './useTransactions'
import { useDebounce } from './useDebounce'

// Query Keys
export const transactionRuleKeys = {
  all: ['transaction-rules'] as const,
  list: () => [...transactionRuleKeys.all, 'list'] as const,
  preview: (conditions: TransactionRuleConditions) =>
    [...transactionRuleKeys.all, 'preview', conditions] as const,
}

/**
 * Fetch the user's transaction rules
 */
export function useTransactionRules() {
  return useQuery({
    queryKey: transactionRuleKeys.list(),
    queryFn: getTransactionRules,
  })
}

/**
 * Live count of the transactions a set of rule conditions matches (debounced while typing)
 */
export function useRulePreview(
  {
    matchTerms,
    transactionType = null,
    minAmount = null,
    maxAmount = null,
  }: TransactionRuleConditions,
  enabled: boolean = true
) {
  // Debounce each value on its own: the conditions object is new on every render
  const debouncedTerms = useDebounce(matchTerms)
  const debouncedMin = useDebounce(minAmount)
  const debouncedMax = useDebounce(maxAmount)
  const conditions = {
    matchTerms: debouncedTerms,
    transactionType,
    minAmount: debouncedMin,
    maxAmount: debouncedMax,
  }

  return useQuery({
    queryKey: transactionRuleKeys.preview(conditions),
    queryFn: () => previewTransactionRule(conditions),
    enabled: enabled && debouncedTerms.length > 0,
    placeholderData: keepPreviousData,
  })
}

function useInvalidateRules() {
  const queryClient = useQueryClient()

  return () => {
    queryClient.invalidateQueries({ queryKey: transactionRuleKeys.all })
    queryClient.invalidateQueries({ queryKey: transactionKeys.all })
  }
}

/**
 * Create a transaction rule
 */
export function useCreateTransactionRule() {
  const invalidate = useInvalidateRules()

  return useMutation({
    mutationFn: (data: TransactionRuleInput) => createTransactionRule(data),
    onSuccess: () => {
      invalidate()
      toast.success('Rule created')
    },
    onError: () => {
      toast.error('Failed to create rule')
    },
  })
}

/**
 * Update a transaction rule
 */
export function useUpdateTransactionRule() {
  const invalidate = useInvalidateRules()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TransactionRuleInput> }) =>
      updateTransactionRule(id, data),
    onSuccess: () => {
      invalidate()
      toast.success('Rule updated')
    },
    onError: () => {
      toast.error('Failed to update rule')
    },
  })
}

/**
 * Delete a transaction rule
 */
export function useDeleteTransactionRule() {
  const invalidate = useInvalidateRules()

  return useMutation({
    mutationFn: (id: string) => deleteTransactionRule(id),
    onSuccess: () => {
      invalidate()
      toast.success('Rule deleted')
    },
    onError: () => {
      toast.error('Failed to delete rule')
    },
  })
}
