/**
 * Account Balances card component
 */

import { Link } from '@tanstack/react-router'
import { SectionCard } from '@/components/ui/section-card'
import { Button } from '@/components/ui/button'
import { ChevronRight } from 'lucide-react'
import { AccountBalanceCard } from './account-balance-card'
import type { AccountBalanceInfo } from '@/lib/api'

interface AccountBalancesCardProps {
  accounts: AccountBalanceInfo[]
}

export function AccountBalancesCard({ accounts }: AccountBalancesCardProps) {
  if (!accounts || accounts.length === 0) {
    return null
  }

  return (
    <SectionCard
      title="Account Balances"
      className="mb-6"
      action={
        <Link to="/accounts">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            Manage accounts
            <ChevronRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <AccountBalanceCard key={account.accountId} account={account} />
        ))}
      </div>
    </SectionCard>
  )
}
