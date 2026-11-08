import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getBackups, createBackup, restoreBackup, saveBackup } from '@/lib/api'

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
 * Save a passphrase-protected backup file (download, or Downloads folder in the desktop app)
 */
export function useSaveBackup() {
  return useMutation({
    mutationFn: ({ name, passphrase }: { name: string; passphrase: string }) =>
      saveBackup(name, passphrase),
    onSuccess: (path) => toast.success(path ? 'Saved to Downloads' : 'Backup downloaded'),
    onError: () => toast.error('Could not save the backup'),
  })
}
