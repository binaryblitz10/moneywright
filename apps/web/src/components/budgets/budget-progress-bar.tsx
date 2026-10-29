import { cn } from '@/lib/utils'
import type { Budget } from '@/lib/api'

const STATUS_BAR: Record<Budget['status'], string> = {
  ok: 'bg-positive',
  warning: 'bg-warning',
  over: 'bg-negative',
}

interface BudgetProgressBarProps {
  percentUsed: number
  status: Budget['status']
  label: string
  /** Where an even spend would be today (0-100); leave out to hide the marker */
  pacePercent?: number
  className?: string
}

/** Rounded progress bar in the status colour, with an optional marker for today's pace */
export function BudgetProgressBar({
  percentUsed,
  status,
  label,
  pacePercent,
  className,
}: BudgetProgressBarProps) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(percentUsed)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('relative h-2 w-full rounded-full bg-muted', className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-700 ease-out',
          STATUS_BAR[status]
        )}
        style={{ width: `${Math.min(100, Math.max(percentUsed, percentUsed > 0 ? 1.5 : 0))}%` }}
      />
      {pacePercent !== undefined && pacePercent > 0 && pacePercent < 100 && (
        <span
          aria-hidden
          title="Where an even spend would be today"
          className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-foreground/60"
          style={{ left: `${pacePercent}%` }}
        />
      )}
    </div>
  )
}
