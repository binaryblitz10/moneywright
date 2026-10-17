import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRenameNamesJobStatus, renameTransactionNames } from '@/lib/api'
import { transactionKeys } from './useTransactions'

/**
 * Start the one-time rename of older transactions and follow its progress
 */
export function useRenameTransactionNames() {
  const queryClient = useQueryClient()
  const [jobId, setJobId] = useState<string | null>(null)

  const start = useMutation({
    mutationFn: renameTransactionNames,
    onSuccess: (data) => setJobId(data.jobId),
  })

  const { data: job } = useQuery({
    queryKey: ['rename-names-job', jobId],
    queryFn: async () => {
      const status = await getRenameNamesJobStatus(jobId!)
      if (status.status === 'completed') {
        queryClient.invalidateQueries({ queryKey: transactionKeys.all })
      }
      return status
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'completed' || status === 'failed' ? false : 1500
    },
  })

  const isRunning =
    start.isPending ||
    (!!jobId && (!job || job.status === 'pending' || job.status === 'processing'))

  return { start: start.mutate, startError: start.error, job, isRunning }
}
