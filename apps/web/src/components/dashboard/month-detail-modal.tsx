/**
 * Month Detail Modal component
 */

import { useState, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from './utils'
import { SORT_OPTIONS, type SortOption, type ViewMode } from './types'
import type { MonthlyTrendData, MonthTransactionsResponse, Transaction } from '@/lib/api'

interface MonthDetailModalProps {
  month: MonthlyTrendData | null
  data: MonthTransactionsResponse | undefined
  isLoading: boolean
  getCategoryLabel: (code: string) => string
  onClose: () => void
  /** Dashboard range start (YYYY-MM-DD); the transactions link never starts before it */
  startDate?: string
  /** Dashboard range end (YYYY-MM-DD); the transactions link never ends after it */
  endDate?: string
}

/** Row direction: income/expense columns can contain reversals, other flows are neutral */
type RowFlow = 'income' | 'expense' | 'other'

const EMPTY_TOTALS = { income: 0, expenses: 0, invested: 0, net: 0 }

function sortTransactions(transactions: Transaction[], sortBy: SortOption): Transaction[] {
  return [...transactions].sort((a, b) => {
    switch (sortBy) {
      case 'latest':
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      case 'oldest':
        return new Date(a.date).getTime() - new Date(b.date).getTime()
      case 'highest':
        return b.amount - a.amount
      case 'lowest':
        return a.amount - b.amount
      default:
        return 0
    }
  })
}

/** First and last day of a YYYY-MM month as YYYY-MM-DD strings */
function getMonthBounds(month: string): { first: string; last: string } {
  const [year = 0, monthNumber = 1] = month.split('-').map(Number)
  // Day 0 of the following month is the last day of this month
  const lastDay = new Date(year, monthNumber, 0).getDate()
  return {
    first: `${month}-01`,
    last: `${month}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function MonthDetailModal({
  month,
  data,
  isLoading,
  getCategoryLabel,
  onClose,
  startDate,
  endDate,
}: MonthDetailModalProps) {
  const [sortBy, setSortBy] = useState<SortOption>('highest')
  const [viewMode, setViewMode] = useState<ViewMode>('transactions')
  const [showOtherFlows, setShowOtherFlows] = useState(false)

  // Use data from the API response (already has netting and exclusions applied)
  const totals = data?.totals ?? EMPTY_TOTALS
  const currency = data?.currency || 'INR'

  const income = useMemo(() => sortTransactions(data?.income ?? [], sortBy), [data?.income, sortBy])
  const expenses = useMemo(
    () => sortTransactions(data?.expenses ?? [], sortBy),
    [data?.expenses, sortBy]
  )
  const investments = useMemo(
    () => sortTransactions(data?.investments ?? [], sortBy),
    [data?.investments, sortBy]
  )
  const transfers = useMemo(
    () => sortTransactions(data?.transfers ?? [], sortBy),
    [data?.transfers, sortBy]
  )

  // Categories the transactions page should show for this month
  const categoryCodes = Array.from(
    new Set(
      [...(data?.incomeBreakdown ?? []), ...(data?.categoryBreakdown ?? [])].map((c) => c.category)
    )
  )

  const monthBounds = data ? getMonthBounds(data.month) : null
  // Clip the month to the dashboard range (ISO dates compare correctly as strings)
  const linkStart =
    monthBounds && startDate && startDate > monthBounds.first ? startDate : monthBounds?.first
  const linkEnd = monthBounds && endDate && endDate < monthBounds.last ? endDate : monthBounds?.last

  return (
    <Dialog open={!!month} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold tracking-tight">
              {month?.monthLabel}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Transactions for {month?.monthLabel}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Summary Stats */}
        <div className="px-6 pb-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-surface-elevated border border-border-subtle p-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                Income
              </p>
              <p className="text-lg font-semibold text-foreground tabular-nums tracking-tight">
                {formatCurrency(totals.income, currency)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">{income.length} transactions</p>
            </div>
            <div className="rounded-xl bg-surface-elevated border border-border-subtle p-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                Expenses
              </p>
              <p className="text-lg font-semibold text-foreground tabular-nums tracking-tight">
                {formatCurrency(totals.expenses, currency)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {expenses.length} transactions
              </p>
            </div>
            <div className="rounded-xl bg-surface-elevated border border-border-subtle p-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                Net
              </p>
              <p
                className={cn(
                  'text-lg font-semibold tabular-nums tracking-tight',
                  totals.net >= 0 ? 'text-positive' : 'text-negative'
                )}
              >
                {totals.net >= 0 ? '+' : ''}
                {formatCurrency(totals.net, currency)}
              </p>
            </div>
            <div className="rounded-xl bg-surface-elevated border border-border-subtle p-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                Invested
              </p>
              <p className="text-lg font-semibold text-foreground tabular-nums tracking-tight">
                {formatCurrency(totals.invested, currency)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {investments.length} transactions
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="px-6 pb-4 flex items-center justify-between border-t border-border-subtle pt-4">
          <div
            className={cn(
              'flex items-center p-1 rounded-xl',
              'bg-surface-elevated',
              'border border-border-subtle'
            )}
          >
            <button
              onClick={() => setViewMode('transactions')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
                viewMode === 'transactions'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Transactions
            </button>
            <button
              onClick={() => setViewMode('categories')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
                viewMode === 'categories'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Categories
            </button>
          </div>

          {viewMode === 'transactions' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-sm gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  Sort: {SORT_OPTIONS.find((o) => o.value === sortBy)?.label}
                  <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {SORT_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => setSortBy(option.value)}
                    className={cn(sortBy === option.value && 'bg-accent')}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Content */}
        <div className="px-6 pb-6">
          <div className="grid grid-cols-2 gap-6 h-85">
            {isLoading ? (
              <>
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex items-center gap-2 py-2">
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-2 w-24" />
                      </div>
                      <Skeleton className="h-3 w-16" />
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex items-center gap-2 py-2">
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-2 w-24" />
                      </div>
                      <Skeleton className="h-3 w-16" />
                    </div>
                  ))}
                </div>
              </>
            ) : viewMode === 'transactions' ? (
              <>
                {/* Income Column */}
                <div className="flex flex-col h-full">
                  <div className="flex items-center gap-2 pb-2.5 mb-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-positive" />
                    <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Income
                    </h3>
                    <span className="text-[10px] text-muted-foreground/60">{income.length}</span>
                  </div>
                  <ScrollArea className="h-75">
                    <div className="space-y-0.5 pr-4">
                      {income.length > 0 ? (
                        income.map((txn) => (
                          <MonthTransactionRow
                            key={txn.id}
                            transaction={txn}
                            getCategoryLabel={getCategoryLabel}
                            flow="income"
                          />
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-8">
                          No income this month
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* Expenses Column */}
                <div className="flex flex-col h-full">
                  <div className="flex items-center gap-2 pb-2.5 mb-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-negative" />
                    <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Expenses
                    </h3>
                    <span className="text-[10px] text-muted-foreground/60">{expenses.length}</span>
                  </div>
                  <ScrollArea className="h-75">
                    <div className="space-y-0.5 pr-4">
                      {expenses.length > 0 ? (
                        expenses.map((txn) => (
                          <MonthTransactionRow
                            key={txn.id}
                            transaction={txn}
                            getCategoryLabel={getCategoryLabel}
                            flow="expense"
                          />
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-8">
                          No expenses this month
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </>
            ) : (
              <>
                {/* Income Categories */}
                <div className="flex flex-col h-full">
                  <div className="flex items-center gap-2 pb-2.5 mb-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-positive" />
                    <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Income by Category
                    </h3>
                  </div>
                  <ScrollArea className="h-75">
                    <div className="space-y-1 pr-4">
                      {data && data.incomeBreakdown.length > 0 ? (
                        data.incomeBreakdown.map((cat) => (
                          <CategoryRow
                            key={cat.category}
                            category={cat.category}
                            amount={cat.total}
                            total={totals.income}
                            currency={currency}
                            getCategoryLabel={getCategoryLabel}
                            type="income"
                          />
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-8">
                          No income this month
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* Expenses Categories */}
                <div className="flex flex-col h-full">
                  <div className="flex items-center gap-2 pb-2.5 mb-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-negative" />
                    <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Expenses by Category
                    </h3>
                  </div>
                  <ScrollArea className="h-75">
                    <div className="space-y-1 pr-4">
                      {data && data.categoryBreakdown.length > 0 ? (
                        data.categoryBreakdown.map((cat) => (
                          <CategoryRow
                            key={cat.category}
                            category={cat.category}
                            amount={cat.total}
                            total={totals.expenses}
                            currency={currency}
                            getCategoryLabel={getCategoryLabel}
                            type="expense"
                          />
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-8">
                          No expenses this month
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </>
            )}
          </div>

          {/* Investments & transfers (collapsed by default) */}
          {/* The slot keeps its height while loading so the centred dialog doesn't jump when data arrives */}
          {viewMode === 'transactions' && (
            <div className="mt-4 min-h-8">
              {!isLoading && (investments.length > 0 || transfers.length > 0) && (
                <div className="pt-4 border-t border-border-subtle">
                  <button
                    type="button"
                    onClick={() => setShowOtherFlows((open) => !open)}
                    aria-expanded={showOtherFlows}
                    className="flex w-full items-center justify-between text-[10px] font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                  >
                    Investments & transfers (not counted as expenses)
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 transition-transform',
                        showOtherFlows && 'rotate-180'
                      )}
                    />
                  </button>
                  {showOtherFlows && (
                    <ScrollArea className="h-48 mt-2">
                      <div className="space-y-0.5 pr-4">
                        {investments.map((txn) => (
                          <MonthTransactionRow
                            key={txn.id}
                            transaction={txn}
                            getCategoryLabel={getCategoryLabel}
                            flow="other"
                          />
                        ))}
                        {transfers.map((txn) => (
                          <MonthTransactionRow
                            key={txn.id}
                            transaction={txn}
                            getCategoryLabel={getCategoryLabel}
                            flow="other"
                          />
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Link to the matching transactions */}
          {viewMode === 'categories' && (
            <div className="min-h-8">
              {!isLoading && categoryCodes.length > 0 && linkStart && linkEnd && (
                <div className="flex justify-end pt-4">
                  <Link
                    to="/transactions"
                    search={{
                      category: categoryCodes.join(','),
                      startDate: linkStart,
                      endDate: linkEnd,
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    View transactions
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Category breakdown row
function CategoryRow({
  category,
  amount,
  total,
  currency,
  getCategoryLabel,
  type,
}: {
  category: string
  amount: number
  total: number
  currency: string
  getCategoryLabel: (code: string) => string
  type: 'income' | 'expense'
}) {
  const isNetRefund = amount < 0
  const percentage = total > 0 && !isNetRefund ? (amount / total) * 100 : 0
  const barColor = type === 'income' ? 'bg-positive' : 'bg-negative'
  const label = getCategoryLabel(category)
  const truncatedLabel = label.length > 20 ? label.slice(0, 20) + '…' : label

  return (
    <div className="py-2 px-2 rounded-lg hover:bg-surface-hover transition-colors">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-foreground" title={label}>
          {truncatedLabel}
        </span>
        <span
          className={cn(
            'text-xs font-semibold tabular-nums ml-2 whitespace-nowrap',
            isNetRefund ? 'text-positive' : 'text-foreground'
          )}
        >
          {isNetRefund && '−'}
          {formatCurrency(Math.abs(amount), currency)}
          {isNetRefund && (
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">net refund</span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 bg-surface-elevated rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', barColor)}
            style={{ width: isNetRefund ? '0%' : `${Math.max(percentage, 2)}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">
          {percentage.toFixed(0)}%
        </span>
      </div>
    </div>
  )
}

// Simplified transaction row for the modal
function MonthTransactionRow({
  transaction,
  getCategoryLabel,
  flow,
}: {
  transaction: Transaction
  getCategoryLabel: (code: string) => string
  flow: RowFlow
}) {
  const description = transaction.summary || transaction.originalDescription
  // Limit description to 26 characters to prevent overflow
  const truncatedDescription =
    description.length > 26 ? description.slice(0, 26) + '…' : description

  // A debit in Income is a reversal; a credit in Expenses is a refund
  const isReversal =
    (flow === 'income' && transaction.type === 'debit') ||
    (flow === 'expense' && transaction.type === 'credit')
  const isCredit = transaction.type === 'credit'

  return (
    <div className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-surface-hover transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground" title={description}>
          {truncatedDescription}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {formatDate(transaction.date)} · {getCategoryLabel(transaction.category)}
        </p>
      </div>
      <p
        className={cn(
          'text-xs font-semibold tabular-nums whitespace-nowrap',
          isReversal && flow === 'income' && 'text-negative',
          isReversal && flow === 'expense' && 'text-positive',
          !isReversal && isCredit && 'text-positive',
          !isReversal && !isCredit && 'text-foreground'
        )}
      >
        {isReversal && '−'}
        {formatCurrency(Math.abs(transaction.amount), transaction.currency)}
      </p>
    </div>
  )
}
