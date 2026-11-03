import { CircleHelp, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { StatementValidation } from '@/lib/api'

const METHOD_LABEL: Record<StatementValidation['method'], string> = {
  printed_totals: 'Checked against the totals printed on the statement',
  running_balance: 'Checked against the running balance column',
  none: 'The statement has no totals or running balance to check against',
}

const BADGE = {
  verified: { label: 'Verified', Icon: ShieldCheck, className: 'bg-positive-muted text-positive' },
  mismatch: {
    label: "Totals didn't match",
    Icon: TriangleAlert,
    className: 'bg-warning-muted text-warning',
  },
  unchecked: {
    label: "Couldn't verify",
    Icon: CircleHelp,
    className: 'bg-surface-elevated text-muted-foreground',
  },
} as const

interface VerificationBadgeProps {
  validation: StatementValidation
}

/** Whether the parsed transactions agreed with the statement, with the details on hover */
export function VerificationBadge({ validation }: VerificationBadgeProps) {
  const { label, Icon, className } = BADGE[validation.status]

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
            className
          )}
        >
          <Icon className="h-3 w-3" />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4} className="max-w-xs">
        <p>{METHOD_LABEL[validation.method]}</p>
        {validation.issues.map((issue) => (
          <p key={issue} className="mt-1">
            {issue}
          </p>
        ))}
      </TooltipContent>
    </Tooltip>
  )
}
