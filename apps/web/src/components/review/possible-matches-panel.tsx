/**
 * SMS transactions that match a statement line on account, date and amount but not on the merchant
 * text. The user says whether each pair is the same purchase.
 */

import { Check, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { TableSkeleton } from '@/components/ui/skeleton'
import { usePossibleMatches, useResolvePossibleMatch } from '@/hooks'
import type { Account, Transaction } from '@/lib/api'
import type { ReviewPanelProps } from './types'

function accountName(accounts: Account[], id: string): string {
  const account = accounts.find((a) => a.id === id)
  return account?.accountName ?? account?.institution ?? 'Account'
}

interface LineProps {
  label: string
  transaction: Transaction
  formatAmount: (amount: number, currency: string) => string
}

function Line({ label, transaction, formatAmount }: LineProps) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="truncate text-sm font-medium">{transaction.originalDescription}</p>
      <p className="text-xs text-muted-foreground tabular-nums">
        {transaction.date} · {transaction.type === 'credit' ? '+' : '-'}
        {formatAmount(transaction.amount, transaction.currency)}
      </p>
    </div>
  )
}

export function PossibleMatchesPanel({ filters, accounts, formatAmount }: ReviewPanelProps) {
  const { data: matches = [], isLoading } = usePossibleMatches(filters.profileId, filters.enabled)
  const resolveMutation = useResolvePossibleMatch()

  if (isLoading) return <TableSkeleton rows={4} />

  if (matches.length === 0) {
    return (
      <EmptyState
        icon={Check}
        title="No possible matches"
        description="SMS transactions that line up with a statement line but name a different merchant will appear here."
      />
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        These SMS transactions have the same date and amount as a statement line, but the merchant
        names do not overlap. Confirm the ones that are the same purchase.
      </p>

      {matches.map(({ sms, candidates }) => (
        <div
          key={sms.id}
          className="space-y-3 rounded-xl border border-border-subtle bg-card p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Line label="From SMS" transaction={sms} formatAmount={formatAmount} />
            <span className="text-xs text-muted-foreground">
              {accountName(accounts, sms.accountId)}
            </span>
          </div>

          <div className="space-y-2 border-t border-border-subtle pt-3">
            {candidates.map((candidate) => (
              <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-3">
                <Line
                  label="On the statement"
                  transaction={candidate}
                  formatAmount={formatAmount}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resolveMutation.isPending}
                    onClick={() =>
                      resolveMutation.mutate({
                        smsTransactionId: sms.id,
                        transactionId: candidate.id,
                        same: false,
                      })
                    }
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" />
                    Different
                  </Button>
                  <Button
                    size="sm"
                    disabled={resolveMutation.isPending}
                    onClick={() =>
                      resolveMutation.mutate({
                        smsTransactionId: sms.id,
                        transactionId: candidate.id,
                        same: true,
                      })
                    }
                  >
                    {resolveMutation.isPending ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Same purchase
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
