import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getSmsImportStatus,
  updateSmsImportSettings,
  syncSmsImport,
  clearSmsImport,
  getPendingSms,
  getSyncedSms,
  openSmsPermissionSettings,
  importPendingSms,
  dismissPendingSms,
  restoreDismissedSms,
  type SmsImportInput,
} from '@/lib/api'
import { transactionKeys } from './useTransactions'
import { accountKeys } from './useAccounts'

// Query Keys
export const smsImportKeys = {
  all: ['sms-import'] as const,
  status: () => [...smsImportKeys.all, 'status'] as const,
  pending: () => [...smsImportKeys.all, 'pending'] as const,
  messages: () => [...smsImportKeys.all, 'messages'] as const,
}

/**
 * Whether message reading is on, the permission state and how many messages wait for review
 */
export function useSmsImportStatus() {
  return useQuery({
    queryKey: smsImportKeys.status(),
    queryFn: getSmsImportStatus,
  })
}

/**
 * Messages that could not be imported automatically
 */
export function usePendingSms(enabled: boolean) {
  return useQuery({
    queryKey: smsImportKeys.pending(),
    queryFn: getPendingSms,
    enabled,
  })
}

/**
 * Every message read as a transaction alert, newest first
 */
export function useSyncedSms(enabled: boolean) {
  return useQuery({
    queryKey: smsImportKeys.messages(),
    queryFn: getSyncedSms,
    enabled,
  })
}

/**
 * Open the Full Disk Access pane of System Settings
 */
export function useOpenSmsPermissionSettings() {
  return useMutation({
    mutationFn: openSmsPermissionSettings,
    onError: () => toast.error('Could not open System Settings'),
  })
}

/**
 * Switch message reading or AI parsing on or off
 */
export function useUpdateSmsImportSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateSmsImportSettings,
    onSuccess: (status) => {
      queryClient.setQueryData(smsImportKeys.status(), status)
    },
    onError: () => toast.error('Could not update message settings'),
  })
}

/**
 * Read messages right now, optionally everything since a date
 */
export function useSyncSmsImport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (since?: string) => syncSmsImport(since),
    onSuccess: ({ imported, needsReview, verified }) => {
      queryClient.invalidateQueries({ queryKey: smsImportKeys.all })
      if (imported + verified > 0) {
        queryClient.invalidateQueries({ queryKey: transactionKeys.all })
        queryClient.invalidateQueries({ queryKey: accountKeys.all })
      }
      const parts = [
        imported > 0 ? `${imported} imported` : null,
        verified > 0 ? `${verified} verified` : null,
        needsReview > 0 ? `${needsReview} to review` : null,
      ].filter(Boolean)
      toast.success(parts.length === 0 ? 'No new bank messages' : parts.join(', '))
    },
    onError: () => toast.error('Could not read messages'),
  })
}

/**
 * Remove all synced messages and the transactions created from them
 */
export function useClearSmsImport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: clearSmsImport,
    onSuccess: ({ transactions }) => {
      queryClient.invalidateQueries({ queryKey: smsImportKeys.all })
      queryClient.invalidateQueries({ queryKey: transactionKeys.all })
      queryClient.invalidateQueries({ queryKey: accountKeys.all })
      toast.success(`Removed ${transactions} transactions imported from messages`)
    },
    onError: () => toast.error('Could not clear synced messages'),
  })
}

/**
 * Create a transaction from a waiting message
 */
export function useImportPendingSms() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SmsImportInput }) => importPendingSms(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: smsImportKeys.all })
      queryClient.invalidateQueries({ queryKey: transactionKeys.all })
      queryClient.invalidateQueries({ queryKey: accountKeys.all })
      toast.success('Transaction added')
    },
    onError: () => toast.error('Could not add the transaction'),
  })
}

/**
 * Drop a waiting message without importing it
 */
export function useDismissPendingSms() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: dismissPendingSms,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: smsImportKeys.all }),
    onError: () => toast.error('Could not dismiss the message'),
  })
}

/**
 * Undo a dismissal: put the message back in the review list
 */
export function useRestoreDismissedSms() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: restoreDismissedSms,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: smsImportKeys.all })
      toast.success('Message restored to review')
    },
    onError: () => toast.error('Could not restore the message'),
  })
}
