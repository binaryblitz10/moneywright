import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getBackups, createBackup, restoreBackup, exportBackup } from '@/lib/api'

// Query Keys
export const backupKeys = {
  all: ['backups'] as const,
  list: () => [...backupKeys.all, 'list'] as const,
}

/**
 * Fetch the saved backups
 */
export function useBackups() {
  return useQuery({
    queryKey: backupKeys.list(),
    queryFn: getBackups,
  })
}

/**
 * Save a backup of the current data now
 */
export function useCreateBackup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createBackup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backupKeys.all })
      toast.success('Backup saved')
    },
    onError: () => toast.error('Could not save the backup'),
  })
}

/**
 * Choose a backup to restore the next time the app starts
 */
export function useRestoreBackup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: restoreBackup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: backupKeys.all })
      toast.success('Restore is ready. Quit and reopen Moneywright to finish.')
    },
    onError: () => toast.error('Could not prepare the restore'),
  })
}

/**
 * Save a backup zip to the Downloads folder (used in the desktop app)
 */
export function useExportBackup() {
  return useMutation({
    mutationFn: exportBackup,
    onSuccess: () => toast.success('Saved to Downloads'),
    onError: () => toast.error('Could not save the backup'),
  })
}
