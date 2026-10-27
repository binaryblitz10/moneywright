import { useState, type ReactNode } from 'react'
import { AlertCircle, Building2, ChevronRight, CreditCard, Loader2, TrendingUp } from 'lucide-react'
import type { Statement } from '@/lib/api'
import { OverdueBadge } from '@/components/ui/overdue-badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { CoverageTimeline } from './coverage-timeline'

export type StatementGroupKind = 'bank' | 'credit_card' | 'investment'

interface StatementGroupProps {
  /** DOM id, so the page can scroll this group into view */
  id?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** e.g. "••1234" */
  subtitle: string
  logoPath: string | null
  kind: StatementGroupKind
  statements: Statement[]
  /** Date of the account's latest statement, set when the account is overdue */
  overdueSince?: string | null
  /** Latest balance (outstanding amount for credit cards) */
  balance?: number | null
  /** Credit card payments linked after the latest statement */
  paidSinceStatement?: number
  currency?: string
  /** Opens the upload flow from a missing month in the timeline */
  onMissingClick?: () => void
  children: ReactNode
}

const KIND_META = {
  bank: { icon: Building2, balanceLabel: 'Balance' },
  credit_card: { icon: CreditCard, balanceLabel: 'Outstanding' },
  investment: { icon: TrendingUp, balanceLabel: 'Value' },
} as const

const monthYear = (date: string): string =>
  new Date(date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })

export function StatementGroup({
  id,
  open,
  onOpenChange,
  title,
  subtitle,
  logoPath,
  kind,
  statements,
  overdueSince,
  balance,
  paidSinceStatement = 0,
  currency = 'INR',
  onMissingClick,
  children,
}: StatementGroupProps) {
  const [logoError, setLogoError] = useState(false)
  const { icon: Icon, balanceLabel } = KIND_META[kind]
  const count = statements.length
  const formatMoney = (amount: number): string =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)

  const starts = statements
    .map((s) => s.periodStart || s.periodEnd)
    .filter((d): d is string => !!d)
    .sort()
  const ends = statements
    .map((s) => s.periodEnd || s.periodStart)
    .filter((d): d is string => !!d)
    .sort()
  const first = starts[0]
  const last = ends[ends.length - 1]
  const range =
    first && last
      ? monthYear(first) === monthYear(last)
        ? monthYear(last)
        : `${monthYear(first)} – ${monthYear(last)}`
      : null
  const processingCount = statements.filter(
    (s) => s.status === 'pending' || s.status === 'parsing'
  ).length
  const failedCount = statements.filter((s) => s.status === 'failed').length
  const transactionTotal = statements.reduce((sum, s) => sum + s.transactionCount, 0)

  return (
    <Collapsible
      id={id}
      open={open}
      onOpenChange={onOpenChange}
      className="scroll-mt-20 group/statements animate-fade-in overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-sm transition-colors hover:border-border-hover"
    >
      <div>
        <CollapsibleTrigger className="flex w-full items-center gap-4 px-5 pt-4 pb-3 text-left">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated">
            {logoPath && !logoError ? (
              <img
                src={logoPath}
                alt=""
                className="h-6 w-6 object-contain"
                onError={() => setLogoError(true)}
              />
            ) : (
              <Icon className="h-5 w-5 text-muted-foreground/70" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-foreground">{title}</p>
              {overdueSince && <OverdueBadge lastStatementDate={overdueSince} />}
              {processingCount > 0 && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {processingCount} processing
                </span>
              )}
              {failedCount > 0 && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {failedCount} failed
                </span>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {[subtitle, range].filter(Boolean).join(' · ')}
            </p>
          </div>
          {balance != null && (
            <div className="hidden w-44 shrink-0 text-right sm:block">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {balanceLabel}
              </p>
              <p className="text-base font-semibold tabular-nums text-foreground">
                {formatMoney(balance)}
              </p>
              {paidSinceStatement > 0 && (
                <p className="truncate text-[11px] text-muted-foreground">
                  {formatMoney(paidSinceStatement)} paid since
                </p>
              )}
            </div>
          )}
          <div className="w-28 shrink-0 whitespace-nowrap border-l border-border-subtle pl-4 text-right">
            <p className="text-sm font-semibold tabular-nums text-foreground">
              {count} statement{count === 1 ? '' : 's'}
            </p>
            {transactionTotal > 0 && (
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {transactionTotal.toLocaleString()} txns
              </p>
            )}
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/statements:rotate-90" />
        </CollapsibleTrigger>
        {kind !== 'investment' && (
          <div className="px-5 pb-4">
            <CoverageTimeline statements={statements} onMissingClick={onMissingClick} />
          </div>
        )}
      </div>
      <CollapsibleContent className="border-t border-border-subtle bg-surface-elevated/50 p-5">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
