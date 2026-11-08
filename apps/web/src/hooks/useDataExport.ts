import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { eraseAllData, exportTransactions, type TransactionFilters } from '@/lib/api'

/**
 * Save the transactions matching the filters as a CSV file
 */
export function useExportTransactions() {
  return useMutation({
    mutationFn: (filters?: TransactionFilters) => exportTransactions(filters),
    onSuccess: (path) => toast.success(path ? 'Saved to Downloads' : 'Export downloaded'),
    onError: () => toast.error('Could not export the transactions'),
  })
}

/**
 * Erase all data, then reload so the app starts fresh
 */
export function useEraseData() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: eraseAllData,
    onSuccess: () => {
      queryClient.clear()
      window.location.assign('/')
    },
    onError: () => toast.error('Could not erase your data'),
  })
}
