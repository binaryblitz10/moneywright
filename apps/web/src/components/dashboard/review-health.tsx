import { Link } from '@tanstack/react-router'
import { ChevronRight, Copy, FileWarning, ShieldCheck, Wand2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface ReviewHealthProps {
  /** Groups of likely duplicates plus bank messages waiting for a match */
  duplicates: number
  /** Statement gaps, balances that don't add up, card payments to check and the like */
  dataIssues: number
  /** Changes the app made on its own in the last week and that are still in place */
  autoFixed: number
}

const ROW_CLASS =
  'group flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 text-sm transition-colors hover:bg-muted/50'

function Row({
  icon: Icon,
  count,
  children,
}: {
  icon: LucideIcon
  count: number
  children: ReactNode
}) {
  return (
    <>
      <Icon className="h-4 w-4 shrink-0 text-warning" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <span className="text-xs font-medium text-muted-foreground tabular-nums">{count}</span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </>
  )
}

/** Data problems that aren't a single transaction to settle, each linking to where it's fixed */
export function ReviewHealth({ duplicates, dataIssues, autoFixed }: ReviewHealthProps) {
  const duplicatesRow = duplicates > 0 && (
    <li>
      <Link to="/review" search={{}} className={ROW_CLASS}>
        <Row icon={Copy} count={duplicates}>
          Possible duplicates
        </Row>
      </Link>
    </li>
  )

  const autoFixedRow = autoFixed > 0 && (
    <li>
      <Link to="/review" search={{ tab: 'history' }} className={ROW_CLASS}>
        <Wand2 className="h-4 w-4 shrink-0 text-positive" />
        <span className="min-w-0 flex-1 truncate">
          {autoFixed} {autoFixed === 1 ? 'issue' : 'issues'} fixed automatically
        </span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  )

  if (dataIssues === 0) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 rounded-xl border border-positive/15 bg-positive/5 px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-positive/15">
            <ShieldCheck className="h-4 w-4 text-positive" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight">Data health is good</p>
            <p className="text-xs text-muted-foreground">No statement gaps or balance issues</p>
          </div>
        </div>
        {(duplicatesRow || autoFixedRow) && (
          <ul>
            {duplicatesRow}
            {autoFixedRow}
          </ul>
        )}
      </div>
    )
  }

  return (
    <ul>
      {duplicatesRow}
      {dataIssues > 0 && (
        <li>
          <Link to="/settings" search={{ section: 'data' }} className={ROW_CLASS}>
            <Row icon={FileWarning} count={dataIssues}>
              Statement and balance issues
            </Row>
          </Link>
        </li>
      )}
      {autoFixedRow}
    </ul>
  )
}
