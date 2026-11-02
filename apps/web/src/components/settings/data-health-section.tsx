/**
 * Data health card: how complete and trustworthy the imported data is
 */

import { useCallback, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, CheckCircle2, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { SectionCard } from '@/components/ui/section-card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useDataHealth, usePreferences, useSetPreference } from '@/hooks'
import { PREFERENCE_KEYS } from '@/lib/api'
import type { DataHealthBridge } from '@/lib/api'
import { formatCurrency } from '@/components/dashboard/utils'
import { collectIssues, formatLongDate, parseIgnored, type IssueTarget } from './data-health-issues'
import { CardPaymentChecks, DismissedCardPayment } from './card-payment-checks'
import { MetaLabel } from '@/components/ui/meta-label'

/** An unexplained cash difference above this (in rupees) is worth a look */
const RESIDUAL_ALERT = 10000
/** Issue rows shown before "Show all" */
const COLLAPSED_ROWS = 6
/** Ignore key for the cash bridge, which is not one of the issue rows */
const BRIDGE_KEY = 'cash-bridge'

interface DataHealthSectionProps {
  profileId: string | undefined
  /** Cash bridge start (YYYY-MM-DD); defaults to the start of the financial year */
  startDate?: string
  enabled?: boolean
}

interface IgnoreButtonProps {
  ignored: boolean
  onClick: () => void
}

function IgnoreButton({ ignored, onClick }: IgnoreButtonProps) {
  const Icon = ignored ? Eye : EyeOff
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100"
      title={ignored ? 'Stop ignoring this check' : 'Ignore this check'}
      aria-label={ignored ? 'Stop ignoring this check' : 'Ignore this check'}
      onClick={onClick}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  )
}

function IssueLink({ target, children }: { target: IssueTarget; children: React.ReactNode }) {
  const className =
    'group flex items-center justify-between gap-3 rounded-lg px-2 py-2 -mx-2 transition-colors hover:bg-muted/50'
  switch (target.page) {
    case 'statements':
      return (
        <Link
          to="/statements"
          search={{ ids: target.statementIds?.join(','), accountId: target.accountId }}
          className={className}
        >
          {children}
        </Link>
      )
    case 'transactions':
      return (
        <Link
          to="/transactions"
          search={{ category: target.category, statementId: target.statementId }}
          className={className}
        >
          {children}
        </Link>
      )
    case 'review':
      return (
        <Link to="/review" search={{ tab: 'low_confidence' }} className={className}>
          {children}
        </Link>
      )
  }
}

function BridgeLine({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-medium tabular-nums', className)}>{value}</span>
    </div>
  )
}

function CashBridge({ bridge }: { bridge: DataHealthBridge }) {
  const period = `${formatLongDate(bridge.startDate)} - ${formatLongDate(bridge.endDate)}`

  if (bridge.status === 'insufficient' || bridge.netChange === null || bridge.residual === null) {
    return (
      <div className="space-y-1">
        <MetaLabel as="p">Cash bridge</MetaLabel>
        <p className="text-sm text-muted-foreground">
          {bridge.missingAccounts.length > 0
            ? `Balances are unknown for ${bridge.missingAccounts.map((a) => a.accountName).join(', ')} in ${period}.`
            : `No period to check: ${period}.`}
        </p>
      </div>
    )
  }

  const alert = Math.abs(bridge.residual) > RESIDUAL_ALERT
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        Cash bridge <span className="normal-case tracking-normal">({period})</span>
      </p>
      <BridgeLine label="Change in net cash" value={formatCurrency(bridge.netChange)} />
      <BridgeLine
        label="Explained by income - expenses - invested"
        value={formatCurrency(bridge.explained)}
      />
      <div className="border-t border-border-subtle pt-2">
        <BridgeLine
          label="Unexplained"
          value={formatCurrency(bridge.residual)}
          className={cn(alert && 'text-warning')}
        />
      </div>
    </div>
  )
}

export function DataHealthSection({
  profileId,
  startDate,
  enabled = true,
}: DataHealthSectionProps) {
  const { data: report, isLoading } = useDataHealth(profileId, { startDate, enabled })
  const { data: preferences } = usePreferences()
  const setPreferenceMutation = useSetPreference()
  const [expanded, setExpanded] = useState(false)
  const [showIgnored, setShowIgnored] = useState(false)

  const ignoredKeys = useMemo(
    () => parseIgnored(preferences?.[PREFERENCE_KEYS.DATA_HEALTH_IGNORED_CHECKS]),
    [preferences]
  )
  const toggleIgnored = useCallback(
    (key: string) => {
      const next = ignoredKeys.includes(key)
        ? ignoredKeys.filter((k) => k !== key)
        : [...ignoredKeys, key]
      // A newly ignored check goes straight into the collapsed list; an empty list has nothing to show
      if (!ignoredKeys.includes(key) || next.length === 0) setShowIgnored(false)
      setPreferenceMutation.mutate({
        key: PREFERENCE_KEYS.DATA_HEALTH_IGNORED_CHECKS,
        value: JSON.stringify(next),
      })
    },
    [ignoredKeys, setPreferenceMutation]
  )

  if (!enabled) return null

  const allIssues = report ? collectIssues(report) : []
  const issues = allIssues.filter((issue) => !ignoredKeys.includes(issue.key))
  const ignoredIssues = allIssues.filter((issue) => ignoredKeys.includes(issue.key))
  const bridgeIgnored = ignoredKeys.includes(BRIDGE_KEY)
  const openCardPayments = report?.cardPayments.items ?? []
  const dismissedCardPayments = report?.cardPayments.dismissed ?? []
  const ignoredCount = ignoredIssues.length + dismissedCardPayments.length + (bridgeIgnored ? 1 : 0)
  const visible = expanded ? issues : issues.slice(0, COLLAPSED_ROWS)

  return (
    <SectionCard title="Data Health" contentClassName="space-y-5">
      {isLoading || !report ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm">
            {issues.length + openCardPayments.length === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-positive" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-warning" />
            )}
            <span>
              {report.dataThrough
                ? `Data complete through ${formatLongDate(report.dataThrough)}`
                : 'No statements uploaded yet'}
            </span>
            {report.latestData && report.latestData !== report.dataThrough && (
              <span className="text-muted-foreground">
                (some accounts run to {formatLongDate(report.latestData)})
              </span>
            )}
          </div>

          {issues.length + openCardPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground">All checks passed</p>
          ) : (
            <div className="divide-y divide-border-subtle">
              {visible.map((issue) => (
                <div key={issue.key} className="group/row flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <IssueLink target={issue.target}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{issue.label}</p>
                        <p className="text-xs text-muted-foreground">{issue.detail}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </IssueLink>
                  </div>
                  <IgnoreButton ignored={false} onClick={() => toggleIgnored(issue.key)} />
                </div>
              ))}
              {issues.length > COLLAPSED_ROWS && (
                <div className="pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setExpanded((value) => !value)}
                  >
                    {expanded ? 'Show fewer' : `Show all ${issues.length}`}
                  </Button>
                </div>
              )}
            </div>
          )}

          <CardPaymentChecks items={openCardPayments} />

          {!bridgeIgnored && (
            <div className="group/row flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <CashBridge bridge={report.bridge} />
              </div>
              <IgnoreButton ignored={false} onClick={() => toggleIgnored(BRIDGE_KEY)} />
            </div>
          )}

          {ignoredCount > 0 && (
            <div className="space-y-2 border-t border-border-subtle pt-3">
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowIgnored((value) => !value)}
              >
                {showIgnored ? 'Hide ignored' : `${ignoredCount} ignored`}
              </Button>
              {showIgnored && (
                <div className="divide-y divide-border-subtle">
                  {ignoredIssues.map((issue) => (
                    <div key={issue.key} className="group/row flex items-center gap-1 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-muted-foreground">{issue.label}</p>
                        <p className="text-xs text-muted-foreground">{issue.detail}</p>
                      </div>
                      <IgnoreButton ignored onClick={() => toggleIgnored(issue.key)} />
                    </div>
                  ))}
                  {dismissedCardPayments.map((item) => (
                    <DismissedCardPayment key={item.id} item={item} />
                  ))}
                  {bridgeIgnored && (
                    <div className="group/row flex items-center gap-1 py-2">
                      <p className="min-w-0 flex-1 text-sm text-muted-foreground">Cash bridge</p>
                      <IgnoreButton ignored onClick={() => toggleIgnored(BRIDGE_KEY)} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}
