import { useState, type ReactNode } from 'react'
import { Building2, ChevronRight, CreditCard, TrendingUp } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

export type StatementGroupKind = 'bank' | 'credit_card' | 'investment'

interface StatementGroupProps {
  title: string
  /** e.g. "••1234 · Credit Card" */
  subtitle: string
  logoPath: string | null
  kind: StatementGroupKind
  count: number
  children: ReactNode
}

const KIND_ICONS = {
  bank: Building2,
  credit_card: CreditCard,
  investment: TrendingUp,
} as const

export function StatementGroup({
  title,
  subtitle,
  logoPath,
  kind,
  count,
  children,
}: StatementGroupProps) {
  const [logoError, setLogoError] = useState(false)
  const Icon = KIND_ICONS[kind]

  return (
    <Collapsible defaultOpen className="group/statements space-y-4">
      <CollapsibleTrigger className="flex w-full items-center gap-3 text-left">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated">
          {logoPath && !logoError ? (
            <img
              src={logoPath}
              alt=""
              className="h-5 w-5 object-contain"
              onError={() => setLogoError(true)}
            />
          ) : (
            <Icon className="h-4 w-4 text-muted-foreground/70" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <span className="text-xs text-muted-foreground">
          {count} statement{count === 1 ? '' : 's'}
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]/statements:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  )
}
