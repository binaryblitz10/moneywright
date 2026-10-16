import { TrendingUp, TrendingDown, Wallet, BarChart3 } from 'lucide-react'
import { StatCard, StatCardGrid } from '@/components/ui/stat-card'

interface TransactionStatsProps {
  totalCredits: number
  totalDebits: number
  creditCount: number
  debitCount: number
  netAmount: number
  currency: string
  statsLabel: string
  isLoading?: boolean
  formatAmount?: (amount: number, currency: string) => string
  /** How the net card is worded: plain net, net spent (expense categories) or net income */
  netLabel?: 'net' | 'spent' | 'earned'
}

export function TransactionStats({
  totalCredits,
  totalDebits,
  creditCount,
  debitCount,
  netAmount,
  currency,
  statsLabel,
  isLoading,
  netLabel = 'net',
}: TransactionStatsProps) {
  const totalCount = creditCount + debitCount

  const netCard =
    netLabel === 'spent'
      ? {
          label: 'Net spent',
          value: -netAmount,
          subtitle: 'Expenses after refunds',
          trend: 'down' as const,
        }
      : netLabel === 'earned'
        ? {
            label: 'Net income',
            value: netAmount,
            subtitle: 'Income after reversals',
            trend: netAmount >= 0 ? ('up' as const) : ('down' as const),
          }
        : {
            label: 'Net Amount',
            value: netAmount,
            subtitle: netAmount >= 0 ? 'Surplus' : 'Deficit',
            trend: netAmount >= 0 ? ('up' as const) : ('down' as const),
          }

  return (
    <StatCardGrid>
      {/* Total Credits */}
      <StatCard
        label="Credits"
        value={totalCredits}
        currency={currency}
        subtitle={`${creditCount.toLocaleString()} transactions`}
        icon={TrendingUp}
        loading={isLoading}
        trend="up"
      />

      {/* Total Debits */}
      <StatCard
        label="Debits"
        value={totalDebits}
        currency={currency}
        subtitle={`${debitCount.toLocaleString()} transactions`}
        icon={TrendingDown}
        loading={isLoading}
        trend="down"
      />

      {/* Net Amount */}
      <StatCard
        label={netCard.label}
        value={netCard.value}
        currency={currency}
        subtitle={netCard.subtitle}
        icon={Wallet}
        loading={isLoading}
        trend={netCard.trend}
      />

      {/* Total Transactions */}
      <StatCard
        label="Total"
        value={totalCount}
        subtitle={statsLabel}
        icon={BarChart3}
        loading={isLoading}
        isCount
      />
    </StatCardGrid>
  )
}
