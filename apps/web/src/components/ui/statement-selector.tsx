import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, ChevronDown, Search, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConstants } from '@/hooks/useConstants'
import {
  getAccountShortLabel,
  getStatementDate,
  getStatementPeriodLabel,
  stripExtension,
} from '@/lib/statement-display'
import type { Account, Statement } from '@/lib/api'

export interface StatementSelectorProps {
  statements: Statement[]
  accounts: Account[]
  /** Selected statement IDs */
  values: string[]
  onValuesChange: (statementIds: string[]) => void
  /** Only list statements of these accounts (all when empty) */
  accountIds?: string[]
  triggerClassName?: string
  contentClassName?: string
}

interface StatementGroup {
  key: string
  label: string
  statements: Statement[]
}

const NO_ACCOUNT = 'none'

export function StatementSelector({
  statements,
  accounts,
  values,
  onValuesChange,
  accountIds,
  triggerClassName,
  contentClassName,
}: StatementSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { institutions } = useConstants()

  const accountLabels = useMemo(() => {
    const map = new Map<string, string>()
    for (const account of accounts) {
      map.set(account.id, getAccountShortLabel(account, institutions[account.institution ?? '']))
    }
    return map
  }, [accounts, institutions])

  const getAccountLabel = (statement: Statement): string =>
    (statement.accountId && accountLabels.get(statement.accountId)) || 'Other'

  // Completed statements within the account filter, newest first
  const available = useMemo(
    () =>
      statements
        .filter((s) => s.status === 'completed')
        .filter((s) => !accountIds?.length || accountIds.includes(s.accountId ?? ''))
        .sort((a, b) => getStatementDate(b).localeCompare(getStatementDate(a))),
    [statements, accountIds]
  )

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return available
    return available.filter((s) =>
      [getStatementPeriodLabel(s), getAccountLabel(s), s.originalFilename].some((text) =>
        text.toLowerCase().includes(query)
      )
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, search, accountLabels])

  const groups = useMemo(() => {
    const byAccount = new Map<string, StatementGroup>()
    for (const statement of visible) {
      const key = statement.accountId ?? NO_ACCOUNT
      const group = byAccount.get(key) ?? { key, label: getAccountLabel(statement), statements: [] }
      group.statements.push(statement)
      byAccount.set(key, group)
    }
    return [...byAccount.values()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, accountLabels])

  const selectedStatement =
    values.length === 1 ? statements.find((s) => s.id === values[0]) : undefined

  const triggerLabel = !values.length
    ? 'All statements'
    : selectedStatement
      ? `${getStatementPeriodLabel(selectedStatement)} · ${getAccountLabel(selectedStatement)}`
      : `${values.length} statements`

  const toggle = (id: string) =>
    onValuesChange(values.includes(id) ? values.filter((v) => v !== id) : [...values, id])

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('justify-between font-normal', triggerClassName)}>
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('w-96 p-0', contentClassName)} align="start">
        <div className="border-b border-border-subtle p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by month, account or file..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto p-1.5">
          {!search && (
            <StatementRow
              title="All statements"
              icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
              isSelected={!values.length}
              onClick={() => onValuesChange([])}
            />
          )}

          {groups.map((group) => {
            return (
              <div key={group.key} className="mt-1">
                <div className="px-2 py-1.5">
                  <span className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </span>
                </div>
                {group.statements.map((statement) => (
                  <StatementRow
                    key={statement.id}
                    title={getStatementPeriodLabel(statement)}
                    subtitle={stripExtension(statement.originalFilename)}
                    meta={`${statement.transactionCount} txns`}
                    isSelected={values.includes(statement.id)}
                    onClick={() => toggle(statement.id)}
                  />
                ))}
              </div>
            )
          })}

          {!groups.length && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No statements found
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function StatementRow({
  title,
  subtitle,
  meta,
  icon,
  isSelected,
  onClick,
}: {
  title: string
  subtitle?: string
  meta?: string
  icon?: React.ReactNode
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors',
        'hover:bg-surface-hover',
        isSelected && 'bg-primary/5'
      )}
    >
      {icon && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-elevated">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{title}</div>
        {subtitle && <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>}
      </div>
      {meta && <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>}
      {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  )
}
