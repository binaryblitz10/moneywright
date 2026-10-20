import { cn } from '@/lib/utils'

interface OverdueBadgeProps {
  /** Date of the latest statement, shown on hover */
  lastStatementDate?: string | null
  className?: string
}

export function OverdueBadge({ lastStatementDate, className }: OverdueBadgeProps) {
  const lastDate = lastStatementDate
    ? new Date(lastStatementDate).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : null

  return (
    <span
      title={lastDate ? `Last statement ended ${lastDate}` : undefined}
      className={cn(
        'inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-tight',
        'border-warning/30 bg-warning-muted text-warning',
        className
      )}
    >
      Overdue
    </span>
  )
}
