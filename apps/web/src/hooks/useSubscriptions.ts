import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  addSubscription,
  removeSubscription,
  setSubscriptionFrequency,
  type SubscriptionFrequency,
} from '@/lib/api'
import { invalidateTransactionTotals } from './useTransactions'

/**
 * Add a recurring payment as a subscription
 */
export function useAddSubscription() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      transactionId,
      frequency,
    }: {
      transactionId: string
      frequency: SubscriptionFrequency
    }) => addSubscription(transactionId, frequency),
    onSuccess: () => {
      invalidateTransactionTotals(queryClient)
      toast.success('Subscription added')
    },
    onError: () => {
      toast.error('Failed to add subscription')
    },
  })
}

/**
 * Change how often a subscription is billed
 */
export function useSetSubscriptionFrequency() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ key, frequency }: { key: string; frequency: SubscriptionFrequency }) =>
      setSubscriptionFrequency(key, frequency),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
      toast.success('Frequency updated')
    },
    onError: () => {
      toast.error('Failed to update frequency')
    },
  })
}

/**
 * Remove a subscription
 */
export function useRemoveSubscription() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (key: string) => removeSubscription(key),
    onSuccess: () => {
      invalidateTransactionTotals(queryClient)
      toast.success('Subscription removed')
    },
    onError: () => {
      toast.error('Failed to remove subscription')
    },
  })
}
