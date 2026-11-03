import { useMemo, useState } from 'react'
import { FLOATING_BAR_CLASS } from '@/components/transactions/floating-bar'
import { Check, CheckCheck, Layers, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { QueryError } from '@/components/ui/query-error'
import { TableSkeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useBulkUpdateTransactions, useReviewCounts, useTransactions } from '@/hooks'
import { Pagination } from '@/components/transactions/pagination'
import { TransactionTable } from '@/components/transactions/transaction-table'
import { TransactionEditForm } from '@/components/transactions/transaction-edit-form'
import type { SortBy, SortOrder } from '@/components/transactions/transaction-table'
import { MerchantGroup } from './merchant-group'
import { groupByMerchant } from './merchant-groups'
import type { ReviewPanelProps } from './types'

type StatusFilter = 'all' | 'pending' | 'other'

const LIMIT = 25
// Grouped view loads a bigger slice of rows and pages through the groups instead
const GROUPED_ROW_LIMIT = 200
const GROUPS_PER_PAGE = 10
const GROUPED_KEY = 'review-group-by-merchant'

function readGrouped(): boolean {
  try {
    return localStorage.getItem(GROUPED_KEY) !== 'false'
  } catch {
    return true
  }
}

interface CategorizationPanelProps extends ReviewPanelProps {
  /** 'low_confidence' lists transactions the model categorized with low confidence */
  queue?: 'categorization' | 'low_confidence'
}

export function CategorizationPanel({
  filters,
  queue = 'categorization',
  ...tableProps
}: CategorizationPanelProps) {
  const isLowConfidence = queue === 'low_confidence'
  const [status, setStatus] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState<SortBy>('date')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkEditOpen, setBulkEditOpen] = useState(false)

  const [grouped, setGrouped] = useState(readGrouped)

  const confirmMutation = useBulkUpdateTransactions()

  const { data: counts } = useReviewCounts(filters.profileId)
  const { data, isLoading, isPlaceholderData, isError, error, refetch } = useTransactions(
    { ...filters, reviewStatus: isLowConfidence ? 'low_confidence' : status },
    { page: grouped ? 1 : page, limit: grouped ? GROUPED_ROW_LIMIT : LIMIT, sortBy, sortOrder }
  )

  const transactions = useMemo(() => data?.transactions ?? [], [data?.transactions])
  const total = data?.total ?? 0
  const groups = useMemo(
    () => (grouped ? groupByMerchant(transactions) : []),
    [grouped, transactions]
  )
  const pageCount = grouped ? Math.ceil(groups.length / GROUPS_PER_PAGE) : Math.ceil(total / LIMIT)
  const totalPages = pageCount
  const visibleGroups = groups.slice((page - 1) * GROUPS_PER_PAGE, page * GROUPS_PER_PAGE)

  const toggleGrouped = () => {
    const next = !grouped
    setGrouped(next)
    setPage(1)
    setSelectedIds(new Set())
    try {
      localStorage.setItem(GROUPED_KEY, String(next))
    } catch {
      // Remembering the choice is a nicety
    }
  }

  const changeStatus = (next: StatusFilter) => {
    setStatus(next)
    setPage(1)
    setSelectedIds(new Set())
  }

  const statuses: Array<{ value: StatusFilter; label: string; count?: number }> = [
    { value: 'all', label: 'All', count: counts ? counts.pending + counts.other : undefined },
    { value: 'pending', label: 'Pending', count: counts?.pending },
    { value: 'other', label: 'Other', count: counts?.other },
  ]

  return (
    <div className={cn('space-y-4', selectedIds.size > 0 && 'pb-24')}>
      <div className="flex flex-wrap items-center gap-2">
        {!isLowConfidence &&
          statuses.map((s) => (
            <Button
              key={s.value}
              size="sm"
              variant={status === s.value ? 'secondary' : 'outline'}
              className="h-8"
              onClick={() => changeStatus(s.value)}
            >
              {s.label}
              {s.count !== undefined && (
                <span className="ml-2 text-xs text-muted-foreground">{s.count}</span>
              )}
            </Button>
          ))}
        <Button
          size="sm"
          variant={grouped ? 'secondary' : 'outline'}
          className="h-8 sm:ml-auto"
          onClick={toggleGrouped}
        >
          <Layers className="mr-2 h-4 w-4" />
          Group by merchant
        </Button>
      </div>

      {selectedIds.size > 0 && (
        <div className={FLOATING_BAR_CLASS}>
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex flex-wrap items-center gap-2">
            {isLowConfidence && (
              <Button
                size="sm"
                disabled={confirmMutation.isPending}
                onClick={() =>
                  confirmMutation.mutate(
                    { transactionIds: [...selectedIds], confirmCategory: true },
                    { onSuccess: () => setSelectedIds(new Set()) }
                  )
                }
              >
                <Check className="mr-2 h-4 w-4" />
                Mark as correct
              </Button>
            )}
            <Button
              size="sm"
              variant={isLowConfidence ? 'outline' : 'default'}
              onClick={() => setBulkEditOpen(true)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit selected
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              <X className="mr-2 h-4 w-4" />
              Clear
            </Button>
          </div>
        </div>
      )}

      {isError ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <TableSkeleton rows={10} columns={4} />
      ) : transactions.length > 0 ? (
        <>
          <div className={cn('transition-opacity duration-200', isPlaceholderData && 'opacity-60')}>
            {grouped ? (
              <div className="space-y-3">
                {visibleGroups.map((group) => (
                  <MerchantGroup
                    key={group.key}
                    group={group}
                    isBusy={confirmMutation.isPending}
                    onConfirmAll={(ids) =>
                      confirmMutation.mutate({ transactionIds: ids, confirmCategory: true })
                    }
                    onChangeAll={(ids, category) =>
                      confirmMutation.mutate({ transactionIds: ids, category })
                    }
                    {...tableProps}
                  />
                ))}
                {total > transactions.length && (
                  <p className="text-center text-xs text-muted-foreground">
                    Showing the first {transactions.length} of {total} transactions. Settle these to
                    see the rest.
                  </p>
                )}
              </div>
            ) : (
              <TransactionTable
                transactions={transactions}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSortChange={(newSortBy, newSortOrder) => {
                  setSortBy(newSortBy)
                  setSortOrder(newSortOrder)
                  setPage(1)
                }}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                {...tableProps}
              />
            )}
          </div>
          {totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={(next) => {
                setPage(next)
                setSelectedIds(new Set())
              }}
            />
          )}
        </>
      ) : (
        <EmptyState
          icon={CheckCheck}
          title="All clear"
          description={
            isLowConfidence
              ? 'No transactions are waiting for a category check.'
              : 'Every transaction has a category.'
          }
        />
      )}

      <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {selectedIds.size} Transactions</DialogTitle>
            <DialogDescription>
              Only the fields you change are applied to every selected transaction.
            </DialogDescription>
          </DialogHeader>
          <TransactionEditForm
            transactionIds={[...selectedIds]}
            categories={tableProps.categories}
            onClose={() => setBulkEditOpen(false)}
            onSuccess={() => {
              setBulkEditOpen(false)
              setSelectedIds(new Set())
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
