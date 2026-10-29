import { Link } from '@tanstack/react-router'
import { MoreHorizontal, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CategoryIcon } from '@/components/ui/category-icon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getCategoryColorClasses } from '@/lib/category-colors'
import { cn } from '@/lib/utils'
import { BudgetProgressBar } from './budget-progress-bar'
import { formatBudgetAmount, monthRangeOf, type MonthPace } from './format'
import type { Budget } from '@/lib/api'

const STATUS_PILL: Record<Budget['status'], { label: string; className: string }> = {
  ok: { label: 'On track', className: 'bg-positive/15 text-positive' },
  warning: { label: 'Close to limit', className: 'bg-warning/15 text-warning' },
  over: { label: 'Over budget', className: 'bg-negative/15 text-negative' },
}

interface BudgetCardProps {
  budget: Budget
  /** Colour name of the category, e.g. "orange" */
  color: string
  currency: string
  month: string
  pace: MonthPace
  onEdit: () => void
  onDelete: () => void
}

export function BudgetCard({
  budget,
  color,
  currency,
  month,
  pace,
  onEdit,
  onDelete,
}: BudgetCardProps) {
  const colors = getCategoryColorClasses(color)
  const pill = STATUS_PILL[budget.status]
  const over = budget.status === 'over'
  const perDay =
    pace.isCurrent && !over && pace.daysLeft > 0 ? budget.remaining / pace.daysLeft : null

  return (
    <div className="group relative flex flex-col gap-5 rounded-xl border border-border-subtle bg-card p-5 shadow-sm transition-colors hover:border-border-hover animate-fade-in">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            colors.bg,
            colors.text
          )}
        >
          <CategoryIcon code={budget.category} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <Link
            to="/transactions"
            search={{ category: budget.category, ...monthRangeOf(month) }}
            className="block truncate font-medium after:absolute after:inset-0 after:z-[1] after:content-['']"
          >
            {budget.categoryLabel}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            <span
              className={cn(
                'inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-tight',
                pill.className
              )}
            >
              {pill.label}
            </span>
            {budget.rollover && (
              <span
                title="Unspent money carries over to next month"
                className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-tight text-muted-foreground"
              >
                <RefreshCw className="h-2.5 w-2.5" />
                Rollover
              </span>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative z-10 h-8 w-8 text-muted-foreground"
              aria-label={`${budget.categoryLabel} budget options`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {formatBudgetAmount(budget.spent, currency)}
          </p>
          <p className="text-sm text-muted-foreground tabular-nums">
            of {formatBudgetAmount(budget.available, currency)}
          </p>
        </div>
        {budget.carriedOver > 0 && (
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3" />
            Includes {formatBudgetAmount(budget.carriedOver, currency)} carried over
          </p>
        )}
        <BudgetProgressBar
          percentUsed={budget.percentUsed}
          status={budget.status}
          label={`${budget.categoryLabel} budget used`}
          pacePercent={pace.isCurrent ? pace.percentElapsed : undefined}
        />
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <p
          className={cn(
            'text-sm font-medium tabular-nums',
            over ? 'text-negative' : 'text-foreground'
          )}
        >
          {over
            ? `${formatBudgetAmount(-budget.remaining, currency)} over`
            : `${formatBudgetAmount(budget.remaining, currency)} left`}
        </p>
        <p className="truncate text-xs text-muted-foreground tabular-nums">
          {perDay !== null
            ? `About ${formatBudgetAmount(perDay, currency)} a day`
            : `${Math.round(budget.percentUsed)}% used`}
        </p>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center opacity-0 transition-opacity group-hover:opacity-100"
      >
        <span className="rounded-full border border-border-subtle bg-white px-3 py-1.5 text-xs font-medium text-neutral-900 shadow-lg">
          Show transactions
        </span>
      </div>
    </div>
  )
}
