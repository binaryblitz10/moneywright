import {
  keepPreviousData,
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getTransactions,
  getTransaction,
  getTransactionStats,
  getCategories,
  updateTransaction,
  createTransaction,
  bulkUpdateTransactions,
  bulkDeleteTransactions,
  getDuplicateGroups,
  setDuplicatesDismissed,
  getReviewCounts,
  getPossibleMatches,
  resolvePossibleMatch,
  linkTransactions,
  unlinkTransaction,
  getLinkCandidates,
  getLinkSuggestions,
  setCardPaymentsDismissed,
  getCategorizationStatus,
  type TransactionFilters,
  type TransactionPagination,
} from '@/lib/api'
import { summaryKeys } from './useSummary'
import { reportKeys } from './useReports'
import { spendingChangesKeys } from './useSpendingChanges'
import { dataHealthKeys } from './useDataHealth'

// Query Keys
export const transactionKeys = {
  all: ['transactions'] as const,
  list: (filters?: TransactionFilters, pagination?: TransactionPagination) =>
    [...transactionKeys.all, 'list', filters, pagination] as const,
  detail: (transactionId: string) => [...transactionKeys.all, 'detail', transactionId] as const,
  stats: (filters?: Omit<TransactionFilters, 'minAmount' | 'maxAmount'>) =>
    [...transactionKeys.all, 'stats', filters] as const,
  categories: () => [...transactionKeys.all, 'categories'] as const,
  duplicates: (filters?: TransactionFilters & { dismissed?: boolean }) =>
    [...transactionKeys.all, 'duplicates', filters] as const,
  possibleMatches: (profileId?: string) =>
    [...transactionKeys.all, 'possibleMatches', profileId] as const,
  reviewCounts: (profileId?: string) =>
    [...transactionKeys.all, 'reviewCounts', profileId] as const,
  linkCandidates: (transactionId: string) =>
    [...transactionKeys.all, 'linkCandidates', transactionId] as const,
  linkSuggestions: (transactionId: string) =>
    [...transactionKeys.all, 'linkSuggestions', transactionId] as const,
}

/**
 * Refresh everything derived from transaction rows: lists, cash flow summaries, reports,
 * spending changes, Data Health reconciliation and account balances
 */
export function invalidateTransactionTotals(queryClient: QueryClient): void {
  for (const queryKey of [
    transactionKeys.all,
    summaryKeys.all,
    reportKeys.all,
    spendingChangesKeys.all,
    dataHealthKeys.all,
    ['accounts'],
    ['statements'],
    ['subscriptions'],
    ['loans'],
    ['insurance'],
  ]) {
    queryClient.invalidateQueries({ queryKey })
  }
}

// ============================================
// Query Hooks
// ============================================

/**
 * Fetch transactions with filters and pagination
 * Set filters.profileId to undefined for family view (all profiles)
 */
export function useTransactions(
  filters?: TransactionFilters & { enabled?: boolean },
  pagination?: TransactionPagination
) {
  const { enabled = true, ...filterOptions } = filters ?? {}
  return useQuery({
    queryKey: transactionKeys.list(filterOptions, pagination),
    queryFn: () => getTransactions(filterOptions, pagination),
    enabled,
    // Keep showing the current page while a new filter/page loads, so the layout doesn't jump
    placeholderData: keepPreviousData,
  })
}

/**
 * Fetch a single transaction by ID
 */
export function useTransaction(transactionId: string) {
  return useQuery({
    queryKey: transactionKeys.detail(transactionId),
    queryFn: () => getTransaction(transactionId),
    enabled: !!transactionId,
  })
}

/**
 * Fetch transaction stats with filters
 * Set profileId to undefined for family view (all profiles)
 */
export function useTransactionStats(filters?: {
  profileId?: string
  accountId?: string[]
  statementId?: string[]
  startDate?: string
  endDate?: string
  category?: string[]
  type?: 'credit' | 'debit'
  search?: string
  isSubscription?: boolean
  includeHidden?: boolean
  onlyHidden?: boolean
  enabled?: boolean
}) {
  const { enabled = true, ...filterOptions } = filters ?? {}
  return useQuery({
    queryKey: transactionKeys.stats(filterOptions),
    queryFn: () => getTransactionStats(filterOptions),
    enabled,
    placeholderData: keepPreviousData,
  })
}

/**
 * Fetch categories for user's country
 */
export function useCategories(enabled: boolean = true) {
  return useQuery({
    queryKey: transactionKeys.categories(),
    queryFn: getCategories,
    staleTime: 30 * 60 * 1000, // 30 minutes - categories don't change often
    enabled,
  })
}

/**
 * Fetch link candidates for a transaction
 */
export function useLinkCandidates(transactionId: string) {
  return useQuery({
    queryKey: transactionKeys.linkCandidates(transactionId),
    queryFn: () => getLinkCandidates(transactionId),
    enabled: !!transactionId,
  })
}

/**
 * Fetch the card payment candidates for a transaction
 */
export function useLinkSuggestions(transactionId: string, enabled = true) {
  return useQuery({
    queryKey: transactionKeys.linkSuggestions(transactionId),
    queryFn: () => getLinkSuggestions(transactionId),
    enabled: enabled && !!transactionId,
  })
}

// ============================================
// Mutation Hooks
// ============================================

/**
 * Update a transaction (category, summary)
 */
export function useUpdateTransaction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      transactionId,
      data,
    }: {
      transactionId: string
      data: Parameters<typeof updateTransaction>[1]
    }) => updateTransaction(transactionId, data),
    onSuccess: (transaction) => {
      invalidateTransactionTotals(queryClient)
      queryClient.invalidateQueries({ queryKey: transactionKeys.detail(transaction.id) })
      toast.success('Transaction updated')
    },
    onError: () => {
      toast.error('Failed to update transaction')
    },
  })
}

/**
 * Add a transaction by hand
 */
export function useCreateTransaction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      invalidateTransactionTotals(queryClient)
      toast.success('Transaction added')
    },
    onError: () => {
      toast.error('Failed to add transaction')
    },
  })
}

/**
 * Update category, summary and/or hidden state on multiple transactions
 */
export function useBulkUpdateTransactions() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: bulkUpdateTransactions,
    onSuccess: ({ updatedCount }) => {
      queryClient.invalidateQueries({ queryKey: transactionKeys.all })
      // Category changes can drop entity links
      queryClient.invalidateQueries({ queryKey: ['loans'] })
      queryClient.invalidateQueries({ queryKey: ['insurance'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success(`Updated ${updatedCount} transaction${updatedCount === 1 ? '' : 's'}`)
    },
    onError: () => {
      toast.error('Failed to update transactions')
    },
  })
}

/**
 * Find groups of likely duplicate transactions
 */
export function useDuplicateGroups(
  filters?: TransactionFilters & { enabled?: boolean; dismissed?: boolean }
) {
  const { enabled = true, dismissed = false, ...filterOptions } = filters ?? {}
  return useQuery({
    queryKey: transactionKeys.duplicates({ ...filterOptions, dismissed }),
    queryFn: () => getDuplicateGroups(filterOptions, dismissed),
    enabled,
    placeholderData: keepPreviousData,
  })
}

/**
 * Mark duplicate groups as not duplicates, or bring them back
 */
export function useDismissDuplicates() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ signatures, dismissed }: { signatures: string[]; dismissed: boolean }) =>
      setDuplicatesDismissed(signatures, dismissed),
    onSuccess: (_, { dismissed }) => {
      queryClient.invalidateQueries({ queryKey: transactionKeys.all })
      toast.success(dismissed ? 'Marked as not duplicates' : 'Marked as duplicates again')
    },
    onError: () => {
      toast.error('Failed to update duplicates')
    },
  })
}

/**
 * SMS transactions that might be the same purchase as a statement line
 */
export function usePossibleMatches(profileId?: string, enabled = true) {
  return useQuery({
    queryKey: transactionKeys.possibleMatches(profileId),
    queryFn: () => getPossibleMatches(profileId),
    enabled,
  })
}

/**
 * Confirm or reject a possible match between an SMS transaction and a statement line
 */
export function useResolvePossibleMatch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      smsTransactionId,
      transactionId,
      same,
    }: {
      smsTransactionId: string
      transactionId: string
      same: boolean
    }) => resolvePossibleMatch(smsTransactionId, transactionId, same),
    onSuccess: (_, { same }) => {
      queryClient.invalidateQueries({ queryKey: transactionKeys.all })
      queryClient.invalidateQueries({ queryKey: ['sms-import'] })
      toast.success(same ? 'Verified against the statement' : 'Marked as different purchases')
    },
    onError: () => toast.error('Could not update the match'),
  })
}

/**
 * Number of items waiting in each review queue (drives the sidebar badge)
 */
export function useReviewCounts(profileId?: string) {
  return useQuery({
    queryKey: transactionKeys.reviewCounts(profileId),
    queryFn: () => getReviewCounts(profileId),
  })
}

/**
 * Permanently delete multiple transactions
 */
export function useBulkDeleteTransactions() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: bulkDeleteTransactions,
    onSuccess: ({ deletedCount }) => {
      queryClient.invalidateQueries({ queryKey: transactionKeys.all })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['statements'] })
      toast.success(`Deleted ${deletedCount} transaction${deletedCount === 1 ? '' : 's'}`)
    },
    onError: () => {
      toast.error('Failed to delete transactions')
    },
  })
}

/**
 * Link two transactions
 */
export function useLinkTransactions() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      transactionId1,
      transactionId2,
      linkType,
    }: {
      transactionId1: string
      transactionId2: string
      linkType: 'payment' | 'transfer' | 'refund'
    }) => linkTransactions(transactionId1, transactionId2, linkType),
    onSuccess: () => {
      invalidateTransactionTotals(queryClient)
      toast.success('Transactions linked')
    },
    onError: () => {
      toast.error('Failed to link transactions')
    },
  })
}

/**
 * Unlink a transaction
 */
export function useUnlinkTransaction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: unlinkTransaction,
    onSuccess: () => {
      invalidateTransactionTotals(queryClient)
      toast.success('Transaction unlinked')
    },
    onError: () => {
      toast.error('Failed to unlink transaction')
    },
  })
}

/**
 * Attach a bank payment to the card it paid, before the card statement shows it
 */
export function useLinkToCard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ transactionId, cardId }: { transactionId: string; cardId: string }) =>
      updateTransaction(transactionId, { linkedEntityId: cardId, linkedEntityType: 'credit_card' }),
    onSuccess: () => {
      invalidateTransactionTotals(queryClient)
      toast.success('Linked to card')
    },
    onError: () => {
      toast.error('Failed to link to card')
    },
  })
}

/**
 * Mark card payment checks in Data Health as correct, or bring them back
 */
export function useDismissCardPayments() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ transactionIds, dismissed }: { transactionIds: string[]; dismissed: boolean }) =>
      setCardPaymentsDismissed(transactionIds, dismissed),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataHealthKeys.all })
    },
    onError: () => {
      toast.error('Failed to update the check')
    },
  })
}

/**
 * Get current categorization status
 * Only polls when active (every 5 seconds)
 * Query should be invalidated when uploads/recategorization triggers
 */
export function useCategorizationStatus(enabled: boolean = true) {
  return useQuery({
    queryKey: ['categorization-status'],
    queryFn: getCategorizationStatus,
    enabled,
    // Only poll when processing is active
    refetchInterval: (query) => {
      const data = query.state.data
      return data?.active ? 5000 : false
    },
  })
}
