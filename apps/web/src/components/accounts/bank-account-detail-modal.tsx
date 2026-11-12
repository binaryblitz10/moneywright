import { useState } from 'react'
import {
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  Loader2,
  Receipt,
  Wallet,
  Scale,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  focusDialogOnOpen,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { parseLocalDate } from '@/lib/date-presets'
import { cn } from '@/lib/utils'
import type { Account, AccountType } from '@/lib/api'
import { useTransactions, useAverageBalance } from '@/hooks'
import { MetricCard } from './credit-card-display'

const RECENT_TRANSACTION_LIMIT = 10

interface BankAccountDetailModalProps {
  account: Account | null
  onOpenChange: (open: boolean) => void
  accountTypes: AccountType[]
  countryCode: string
  institutionName?: string
  currencySymbol?: string
}

export function BankAccountDetailModal({
  account,
  onOpenChange,
  accountTypes,
  countryCode,
  institutionName,
  currencySymbol = '₹',
}: BankAccountDetailModalProps) {
  const [logoError, setLogoError] = useState(false)

  const accountIds = account ? [account.id] : undefined
  const { data: avgBalance } = useAverageBalance(account?.id ?? '')
  const { data: recent, isLoading: isLoadingRecent } = useTransactions(
    { accountId: accountIds, enabled: !!account },
    { limit: RECENT_TRANSACTION_LIMIT, sortBy: 'date', sortOrder: 'desc' }
  )

  if (!account) return null

  const logoPath = account.institution
    ? `/institutions/${countryCode}/${account.institution}.svg`
    : null

  const lastFour = account.accountNumber?.slice(-4) || null
  const typeLabel =
    accountTypes.find((t) => t.code === account.type)?.label || account.type.replace(/_/g, ' ')

  const formatAmount = (amount: number | null) => {
    if (amount === null) return '—'
    return new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(amount))
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  const balance = account.latestBalance
  const transactions = recent?.transactions ?? []

  return (
    <Dialog open={!!account} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-xl p-0 gap-0 overflow-hidden max-h-[90vh]"
        showCloseButton={false}
        onOpenAutoFocus={focusDialogOnOpen}
      >
        {/* Header */}
        <div
          className={cn(
            'relative px-6 pt-6 pb-8',
            'bg-gradient-to-br from-card via-card to-card',
            'border-b border-border-subtle'
          )}
        >
          <div
            className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 1px)`,
              backgroundSize: '24px 24px',
            }}
          />

          <DialogHeader className="relative">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className={cn(
                    'h-14 w-14 rounded-2xl flex items-center justify-center shrink-0',
                    'bg-gradient-to-br shadow-lg',
                    !logoPath || logoError
                      ? 'from-emerald-500/20 to-emerald-600/20'
                      : 'bg-surface-elevated border border-border-subtle'
                  )}
                >
                  {logoPath && !logoError ? (
                    <img
                      src={logoPath}
                      alt={institutionName || account.institution || ''}
                      className="h-8 w-8 object-contain"
                      onError={() => setLogoError(true)}
                    />
                  ) : (
                    <Building2 className="h-7 w-7 text-emerald-500" />
                  )}
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-xl font-semibold truncate">
                    {institutionName || account.institution || 'Bank Account'}
                  </DialogTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-muted-foreground">{typeLabel}</span>
                    {lastFour && (
                      <span className="text-sm text-muted-foreground font-mono">
                        •••• {lastFour}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
                  account.isActive
                    ? 'bg-positive/10 text-positive'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {account.isActive ? (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-positive opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-positive"></span>
                  </span>
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                <span>{account.isActive ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
          </DialogHeader>
        </div>

        <ScrollArea className="max-h-[calc(90vh-180px)]">
          <div className="p-6 space-y-6">
            {/* Balance hero */}
            <div className="relative rounded-2xl border border-border-subtle bg-gradient-to-br from-surface-elevated to-card p-5 overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-positive/5 rounded-full blur-3xl" />

              <div className="relative">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-8 w-8 rounded-lg bg-positive/10 flex items-center justify-center">
                    <Wallet className="h-4 w-4 text-positive" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Current Balance</p>
                    <p className="text-xs text-muted-foreground">
                      Last Statement
                      <br />
                      {formatDate(account.latestStatementDate)}
                    </p>
                  </div>
                </div>

                <p
                  className={cn(
                    'text-3xl font-bold tabular-nums',
                    balance !== null && balance < 0 ? 'text-negative' : 'text-positive'
                  )}
                >
                  {balance !== null && balance < 0 && '-'}
                  {currencySymbol}
                  {formatAmount(balance)}
                </p>
              </div>
            </div>

            {/* Key metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <MetricCard
                icon={Landmark}
                label="Account Type"
                value={typeLabel}
                iconColor="text-blue-500"
                iconBg="bg-blue-500/10"
              />
              <MetricCard
                icon={Calendar}
                label="Last Statement"
                value={formatDate(account.latestStatementDate)}
                iconColor="text-emerald-500"
                iconBg="bg-emerald-500/10"
              />
              <MetricCard
                icon={Scale}
                label="Avg. Balance (12m)"
                value={avgBalance != null ? `${currencySymbol}${formatAmount(avgBalance)}` : '—'}
                iconColor="text-orange-500"
                iconBg="bg-orange-500/10"
              />
            </div>

            {/* Recent transactions */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Recent Transactions</h3>
              </div>

              {isLoadingRecent ? (
                <div className="flex items-center justify-center gap-2 text-muted-foreground py-12">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Loading transactions...</span>
                </div>
              ) : transactions.length > 0 ? (
                <div className="space-y-2">
                  {transactions.map((txn, index) => {
                    const isCredit = txn.type === 'credit'
                    return (
                      <div
                        key={txn.id}
                        className={cn(
                          'flex items-center justify-between p-4 rounded-xl border border-border-subtle',
                          'bg-card hover:bg-surface-elevated transition-colors',
                          'group cursor-default'
                        )}
                        style={{
                          animationDelay: `${index * 50}ms`,
                          animation: 'fadeInUp 0.3s ease-out forwards',
                        }}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-surface-elevated border border-border-subtle shrink-0">
                            {isCredit ? (
                              <ArrowDownLeft className="h-5 w-5 text-positive" />
                            ) : (
                              <ArrowUpRight className="h-5 w-5 text-negative" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {txn.summary || txn.originalDescription}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {parseLocalDate(txn.date.slice(0, 10)).toLocaleDateString('en-GB', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <p
                            className={cn(
                              'text-base font-semibold tabular-nums',
                              isCredit ? 'text-positive' : 'text-negative'
                            )}
                          >
                            {isCredit ? '+' : '-'}
                            {currencySymbol}
                            {formatAmount(txn.amount)}
                          </p>
                          <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                    <Receipt className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">No transactions yet</p>
                  <p className="text-xs text-muted-foreground max-w-[280px]">
                    Transactions will appear here once you upload a statement for this account
                  </p>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <div className="px-6 py-4 border-t border-border-subtle bg-surface-elevated">
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>

      {/* Animation styles */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </Dialog>
  )
}
