import { useState, type ReactNode } from 'react'
import { CalendarDays, ChartSpline } from 'lucide-react'
import { SectionCard } from '@/components/ui/section-card'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { cn } from '@/lib/utils'
import { formatBudgetAmount, type MonthPace } from './format'
import { GlanceCalendar } from './glance/glance-calendar'
import { dayLabel, getGlanceStats, glanceHeadline, plural } from './glance/glance-stats'
import { GlanceTrendChart, TrendLegend } from './glance/glance-trend-chart'
import type { Budget, BudgetSummary } from '@/lib/api'

type GlanceView = 'trend' | 'calendar'

const STATUS_PILL: Record<Budget['status'], string> = {
  ok: 'bg-positive/15 text-positive',
  warning: 'bg-warning/15 text-warning',
  over: 'bg-negative/15 text-negative',
}

const VIEW_STORAGE_KEY = 'budgets-glance-view'

function savedView(): GlanceView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'calendar' ? 'calendar' : 'trend'
  } catch {
    return 'trend'
  }
}

interface BudgetGlanceProps {
  summary: BudgetSummary
  pace: MonthPace
  month: string
}

/** How the month is going across every budget, as a spending trend or a daily calendar */
export function BudgetGlance({ summary, pace, month }: BudgetGlanceProps) {
  const [view, setView] = useState<GlanceView>(savedView)
  const stats = getGlanceStats(summary, pace)
  const { currency, available, spent, remaining, over } = stats
  const money = (amount: number) => formatBudgetAmount(amount, currency)

  const changeView = (value: GlanceView) => {
    setView(value)
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, value)
    } catch {
      // Not remembered, still switches
    }
  }

  return (
    <SectionCard
      title="Month at a glance"
      className="gap-0"
      action={
        <div className="flex items-center gap-2">
          {pace.isCurrent && (
            <span className="hidden rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground sm:inline">
              {plural(pace.daysLeft, 'day')} left
            </span>
          )}
          <SegmentedControl
            aria-label="Glance view"
            size="sm"
            value={view}
            onChange={changeView}
            options={[
              { value: 'trend', label: 'Trend', icon: <ChartSpline className="h-3.5 w-3.5" /> },
              {
                value: 'calendar',
                label: 'Calendar',
                icon: <CalendarDays className="h-3.5 w-3.5" />,
              },
            ]}
          />
        </div>
      }
    >
      <div className="space-y-5">
        <div className="-mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <p className={cn('text-2xl font-semibold tracking-tight', over && 'text-negative')}>
            {glanceHeadline(stats, pace)}
          </p>
          {view === 'trend' && <TrendLegend stats={stats} />}
        </div>

        {/* Both views share one height so switching doesn't move the page */}
        <div className="lg:h-80">
          {view === 'trend' ? (
            <GlanceTrendChart stats={stats} month={month} />
          ) : (
            <GlanceCalendar stats={stats} month={month} isCurrent={pace.isCurrent} />
          )}
        </div>

        <dl className="grid grid-cols-2 gap-y-4 border-t border-border-subtle pt-4 sm:grid-cols-3 lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none lg:divide-x lg:divide-border-subtle">
          <GlanceStat
            label="Spent"
            value={money(spent)}
            badge={
              <span
                className={cn(
                  'whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
                  STATUS_PILL[stats.status]
                )}
              >
                {Math.round(stats.percentUsed)}% used
              </span>
            }
            note={`of ${money(available)} budget`}
          />
          <GlanceStat
            label={over ? 'Over by' : 'Left to spend'}
            value={money(Math.abs(remaining))}
            note={
              stats.safePerDay !== null
                ? `About ${money(stats.safePerDay)} a day`
                : over
                  ? `Across ${plural(stats.overCount, 'category')}`
                  : 'Left unspent'
            }
            className={cn(over && 'text-negative')}
          />
          <GlanceStat
            label="Average a day"
            value={money(stats.avgPerDay)}
            note={`Even pace is ${money(stats.dailyBudget)} a day`}
            className={cn(stats.avgPerDay > stats.dailyBudget && 'text-negative')}
          />
          {stats.projected !== null && (
            <GlanceStat
              label="Month-end forecast"
              value={money(stats.projected)}
              note={
                stats.projected > available
                  ? `${money(stats.projected - available)} over budget`
                  : `${money(available - stats.projected)} to spare`
              }
              className={stats.projected > available ? 'text-negative' : 'text-positive'}
            />
          )}
          <GlanceStat
            label="Biggest day"
            value={stats.biggestDay ? money(stats.biggestDay.amount) : '–'}
            note={stats.biggestDay ? dayLabel(month, stats.biggestDay.day) : 'No spending yet'}
          />
        </dl>
      </div>
    </SectionCard>
  )
}

interface GlanceStatProps {
  label: string
  value: string
  note: string
  /** Shown next to the value, e.g. a status pill */
  badge?: ReactNode
  className?: string
}

function GlanceStat({ label, value, note, badge, className }: GlanceStatProps) {
  return (
    <div className="min-w-0 lg:px-5 lg:first:pl-0">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={cn('text-xl font-semibold tracking-tight tabular-nums', className)}>
          {value}
        </span>
        {badge}
      </dd>
      <dd className="mt-0.5 truncate text-xs text-muted-foreground">{note}</dd>
    </div>
  )
}
