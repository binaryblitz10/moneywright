/**
 * SMS transactions that match a statement line on account, date and amount but not on the merchant
 * text. The user says whether each pair is the same purchase.
 */

import { Check, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { QueryError } from '@/components/ui/query-error'
import { TableSkeleton } from '@/components/ui/skeleton'
import { TransactionTable } from '@/components/transactions/transaction-table'
import { usePossibleMatches, useResolvePossibleMatch } from '@/hooks'
import type { ReviewPanelProps } from './types'

export function PossibleMatchesPanel({ filters, formatAmount, ...tableProps }: ReviewPanelProps) {
  const {
    data: matches = [],
    isLoading,
    isError,
    error,
    refetch,
  } = usePossibleMatches(filters.profileId, filters.enabled)
  const resolveMutation = useResolvePossibleMatch()

  if (isError) return <QueryError error={error} onRetry={() => void refetch()} />

  if (isLoading) return <TableSkeleton rows={4} columns={4} />

  if (matches.length === 0) {
    return (
      <EmptyState
        icon={Check}
        title="No possible matches"
        description="SMS transactions that line up with a statement line but name a different merchant will appear here."
      />
    )
  }

  // One group per SMS and statement line pair: the SMS row, then the statement row
  const pairs = matches.flatMap(({ sms, candidates }) =>
    candidates.map((candidate) => ({ sms, candidate }))
  )
  const transactions = pairs.flatMap(({ sms, candidate }) => [sms, candidate])

  const resolve = (smsTransactionId: string, transactionId: string, same: boolean) =>
    resolveMutation.mutate({ smsTransactionId, transactionId, same })

  // One heading row per pair, shown above the SMS row
  const groupHeader = (_txn: unknown, index: number) => {
    if (index % 2 !== 0) return null
    const { sms, candidate } = pairs[index / 2]!
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Same purchase?</span>
          {' · '}
          {formatAmount(sms.amount, sms.currency)}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={resolveMutation.isPending}
            onClick={() => resolve(sms.id, candidate.id, false)}
          >
            <X className="mr-2 h-4 w-4" />
            Different
          </Button>
          <Button
            disabled={resolveMutation.isPending}
            onClick={() => resolve(sms.id, candidate.id, true)}
          >
            {resolveMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Same purchase
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        These SMS transactions have the same date and amount as a statement line, but the merchant
        names do not overlap. Confirm the ones that are the same purchase.
      </p>

      <TransactionTable
        transactions={transactions}
        formatAmount={formatAmount}
        renderGroupHeader={groupHeader}
        {...tableProps}
      />
    </div>
  )
}
