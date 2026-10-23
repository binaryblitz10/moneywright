import { cn } from '@/lib/utils'
import type { Statement } from '@/lib/api'

const MONTHS_SHOWN = 12

interface CoverageTimelineProps {
  statements: Statement[]
  /** Called when a month with no statement is clicked */
  onMissingClick?: () => void
}

interface MonthCell {
  key: string
  label: string
  /** Short month name shown under the indicator, e.g. "Oct" */
  shortLabel: string
  count: number
  /** Before the first statement: nothing is expected yet */
  beforeStart: boolean
  isCurrent: boolean
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}`
}

/** Every month the statement's period touches, even for a single day. */
function coveredMonthKeys(statement: Statement): string[] {
  const start = new Date(statement.periodStart || statement.periodEnd || statement.createdAt)
  const end = new Date(statement.periodEnd || statement.periodStart || statement.createdAt)
  const keys: string[] = []
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  while (cursor <= end) {
    keys.push(monthKey(cursor))
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return keys
}

export function CoverageTimeline({ statements, onMissingClick }: CoverageTimelineProps) {
  const counts = new Map<string, number>()
  for (const statement of statements) {
    if (statement.status === 'failed') continue
    for (const key of coveredMonthKeys(statement)) counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const now = new Date()
  const currentKey = monthKey(now)
  const cells: MonthCell[] = []
  for (let i = MONTHS_SHOWN - 1; i >= 0; i--) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    cells.push({
      key: monthKey(date),
      label: date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      shortLabel: date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
      count: counts.get(monthKey(date)) ?? 0,
      beforeStart: false,
      isCurrent: monthKey(date) === currentKey,
    })
  }

  // Months before the oldest statement in the window are "not started", not "missing"
  const firstCovered = cells.findIndex((c) => c.count > 0)
  cells.forEach((cell, index) => {
    cell.beforeStart = firstCovered === -1 || index < firstCovered
  })

  const missing = cells.filter((c) => c.count === 0 && !c.beforeStart && !c.isCurrent).length

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 items-start gap-1">
        {cells.map((cell) => {
          const isMissing = cell.count === 0 && !cell.beforeStart && !cell.isCurrent
          const title = cell.count
            ? `${cell.label}: ${cell.count} statement${cell.count === 1 ? '' : 's'}`
            : isMissing
              ? `${cell.label}: no statement. Click to upload`
              : cell.label
          const className = cn(
            'h-2.5 w-full rounded-sm transition-colors',
            cell.count > 0 && 'bg-positive/70 hover:bg-positive',
            isMissing &&
              'border border-dashed border-warning/60 bg-warning/10 hover:bg-warning/25 cursor-pointer',
            !cell.count && !isMissing && 'bg-muted'
          )
          return (
            <div key={cell.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              {isMissing ? (
                <button
                  type="button"
                  title={title}
                  aria-label={title}
                  className={className}
                  onClick={onMissingClick}
                />
              ) : (
                <div title={title} className={className} />
              )}
              <span
                className={cn(
                  'text-[10px] leading-none',
                  isMissing ? 'text-warning' : 'text-muted-foreground',
                  cell.isCurrent && 'font-semibold text-foreground'
                )}
              >
                {cell.shortLabel}
              </span>
            </div>
          )
        })}
      </div>
      <span
        className={cn(
          'shrink-0 text-[11px]',
          missing > 0 ? 'font-medium text-warning' : 'text-muted-foreground'
        )}
      >
        {missing > 0 ? `${missing} missing` : 'Up to date'}
      </span>
    </div>
  )
}
