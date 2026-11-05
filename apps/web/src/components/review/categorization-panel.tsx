import { useMemo, useState } from 'react'
import { CheckCheck } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { QueryError } from '@/components/ui/query-error'
import { TableSkeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useBulkUpdateTransactions, useTransactions } from '@/hooks'
import { Pagination } from '@/components/transactions/pagination'
import { CategoryCard } from './category-card'
import { groupByMerchant } from './merchant-groups'
import type { ReviewPanelProps } from './types'

// Loads a big slice of rows and pages through the merchant cards instead
const ROW_LIMIT = 200
const GROUPS_PER_PAGE = 10

export function CategorizationPanel({ filters, ...tableProps }: ReviewPanelProps) {
  const [page, setPage] = useState(1)

  const mutation = useBulkUpdateTransactions()

  const { data, isLoading, isPlaceholderData, isError, error, refetch } = useTransactions(
    { ...filters, reviewStatus: 'needs_review' },
    { page: 1, limit: ROW_LIMIT, sortBy: 'date', sortOrder: 'desc' }
  )

  const transactions = useMemo(() => data?.transactions ?? [], [data?.transactions])
  const total = data?.total ?? 0
  const groups = useMemo(() => groupByMerchant(transactions), [transactions])
  const totalPages = Math.ceil(groups.length / GROUPS_PER_PAGE)
  const visibleGroups = groups.slice((page - 1) * GROUPS_PER_PAGE, page * GROUPS_PER_PAGE)

  return (
    <div className="space-y-4">
      {isError ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <TableSkeleton rows={10} columns={4} />
      ) : transactions.length > 0 ? (
        <>
          <div
            className={cn(
              'grid gap-4 lg:grid-cols-2 transition-opacity duration-200',
              isPlaceholderData && 'opacity-60'
            )}
          >
            {visibleGroups.map((group) => (
              <CategoryCard
                key={group.key}
                group={group}
                isBusy={mutation.isPending}
                onConfirmAll={(ids) =>
                  mutation.mutate({ transactionIds: ids, confirmCategory: true })
                }
                onChangeAll={(ids, category) => mutation.mutate({ transactionIds: ids, category })}
                {...tableProps}
              />
            ))}
            {total > transactions.length && (
              <p className="text-center text-xs lg:col-span-2 text-muted-foreground">
                Showing the first {transactions.length} of {total} transactions. Settle these to see
                the rest.
              </p>
            )}
          </div>
          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          )}
        </>
      ) : (
        <EmptyState
          icon={CheckCheck}
          title="All clear"
          description="Every transaction has a confident category."
        />
      )}
    </div>
  )
}
