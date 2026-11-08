import { Skeleton } from '@/components/ui/skeleton'

interface TransactionStatsProps {
  totalCredits: number
  totalDebits: number
  totalCount: number
  currency: string
  isLoading?: boolean
  formatAmount: (amount: number, currency: string) => string
}

/** Quiet one-line summary of money in, money out and total transactions for the current filters */
export function TransactionStats({
  totalCredits,
  totalDebits,
  totalCount,
  currency,
  isLoading,
  formatAmount,
}: TransactionStatsProps) {
  const item = (label: string, text: string) => (
    <span>
      {label}{' '}
      {isLoading ? (
        <Skeleton className="inline-block h-3 w-16 align-middle" />
      ) : (
        <span className="text-foreground">{text}</span>
      )}
    </span>
  )

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
      {item('Money in', formatAmount(totalCredits, currency))}
      {item('Money out', formatAmount(totalDebits, currency))}
      {item('Total', totalCount.toLocaleString())}
    </div>
  )
}
