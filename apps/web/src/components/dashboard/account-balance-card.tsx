/**
 * Account Balance Card component
 */

import { useState } from 'react'
import { CreditCard, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from './utils'
import type { AccountBalanceInfo } from '@/lib/api'

interface AccountBalanceCardProps {
  account: AccountBalanceInfo
  countryCode: string
}

export function AccountBalanceCard({ account, countryCode }: AccountBalanceCardProps) {
  const [logoError, setLogoError] = useState(false)
  const logoPath = account.institution
    ? `/institutions/${countryCode}/${account.institution}.svg`
    : null
  const hasBalance = account.latestBalance !== null
  const isZero = account.latestBalance === 0

  return (
    <div className="flex items-center gap-3 p-3.5 rounded-lg bg-surface-elevated border border-border-subtle hover:border-border-hover transition-colors">
      <div
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-lg shrink-0 border',
          'bg-surface border-border-subtle'
        )}
      >
        {logoPath && !logoError ? (
          <img
            src={logoPath}
            alt={account.institution ?? ''}
            className="h-6 w-6 object-contain"
            onError={() => setLogoError(true)}
          />
        ) : account.type === 'credit_card' ? (
          <CreditCard className="h-5 w-5 text-muted-foreground" />
        ) : (
          <Building2 className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate text-foreground">
          {account.accountName || account.institution || 'Account'}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {account.isLiability ? 'Credit Card' : account.type?.replace(/_/g, ' ')}
        </p>
      </div>
      <div className="text-right shrink-0">
        {hasBalance ? (
          <>
            <p
              className={cn(
                'text-sm font-semibold tabular-nums',
                isZero ? 'text-foreground' : account.isLiability ? 'text-negative' : 'text-positive'
              )}
            >
              {account.isLiability && !isZero ? '-' : ''}
              {formatCurrency(account.latestBalance!, account.currency)}
            </p>
            {account.latestStatementDate && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {formatDate(account.latestStatementDate)}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No data</p>
        )}
      </div>
    </div>
  )
}
