import { Gauge, PiggyBank, TriangleAlert, Wallet } from 'lucide-react'
import { SectionCard } from '@/components/ui/section-card'
import { StatCard, StatCardGrid } from '@/components/ui/stat-card'
import { cn } from '@/lib/utils'
import { BudgetProgressBar } from './budget-progress-bar'
import { formatBudgetAmount, type MonthPace } from './format'
import type { BudgetSummary } from '@/lib/api'

interface BudgetOverviewProps {
  summary: BudgetSummary
  pace: MonthPace
}

/** Totals across every budget of the month, plus how the month is going against an even pace */
export function BudgetOverview({ summary, pace }: BudgetOverviewProps) {
  const { budgets, currency, totalAvailable, totalSpent } = summary
  const remaining = totalAvailable - totalSpent
  const over = remaining < 0
  const percentUsed = totalAvailable > 0 ? (totalSpent / totalAvailable) * 100 : 0
  const overCount = budgets.filter((b) => b.status === 'over').length
  const status = over ? 'over' : percentUsed >= 80 ? 'warning' : 'ok'

  // Spending an even amount every day would put you here today
  const expected = (totalAvailable * pace.percentElapsed) / 100
  const difference = totalSpent - expected
  const paceText = !pace.isCurrent
    ? over
      ? `You finished ${formatBudgetAmount(-remaining, currency)} over budget`
      : `You finished ${formatBudgetAmount(remaining, currency)} under budget`
    : difference > 0
      ? `${formatBudgetAmount(difference, currency)} ahead of an even pace`
      : `${formatBudgetAmount(-difference, currency)} behind an even pace, nice`
  const perDay = pace.isCurrent && !over && pace.daysLeft > 0 ? remaining / pace.daysLeft : null

  return (
    <div className="space-y-4">
      <StatCardGrid>
        <StatCard
          label="Budgeted"
          value={totalAvailable}
          currency={currency}
          icon={PiggyBank}
          subtitle={`Across ${budgets.length} ${budgets.length === 1 ? 'category' : 'categories'}`}
        />
        <StatCard
          label="Spent"
          value={totalSpent}
          currency={currency}
          icon={Wallet}
          subtitle={`${Math.round(percentUsed)}% of your budget`}
        />
        <StatCard
          label={over ? 'Over by' : 'Remaining'}
          value={Math.abs(remaining)}
          currency={currency}
          icon={Gauge}
          subtitle={
            perDay !== null
              ? `About ${formatBudgetAmount(perDay, currency)} a day for ${pace.daysLeft} days`
              : over
                ? 'Spending went past the limits'
                : 'Left unspent'
          }
          className={cn(over && 'border-negative/40')}
        />
        <StatCard
          label="Over budget"
          value={overCount}
          isCount
          icon={TriangleAlert}
          subtitle={
            overCount === 0
              ? 'Every category is within its limit'
              : `of ${budgets.length} ${budgets.length === 1 ? 'category' : 'categories'}`
          }
        />
      </StatCardGrid>

      <SectionCard title="Month at a glance" contentClassName="space-y-3">
        <BudgetProgressBar
          percentUsed={percentUsed}
          status={status}
          label="Total budget used"
          pacePercent={pace.isCurrent ? pace.percentElapsed : undefined}
          className="h-3"
        />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
          <span className={cn('font-medium', over ? 'text-negative' : 'text-foreground')}>
            {paceText}
          </span>
          {pace.isCurrent && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden className="h-3 w-0.5 rounded-full bg-foreground/60" />
              Marker shows where an even spend would be today
            </span>
          )}
        </div>
      </SectionCard>
    </div>
  )
}
