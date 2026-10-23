import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, ChevronDown, MessageSquareText, Search, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOptionNavigation } from '@/hooks/useOptionNavigation'
import { useConstants } from '@/hooks/useConstants'
import {
  getAccountShortLabel,
  getStatementDate,
  getStatementPeriodLabel,
  stripExtension,
} from '@/lib/statement-display'
import type { Account, Statement } from '@/lib/api'

/** Source value for transactions that came from bank messages (the API reads it as a source) */
export const BANK_MESSAGES_SOURCE = 'sms'
const BANK_MESSAGES_LABEL = 'Bank Messages'

export interface SourceSelectorProps {
  statements: Statement[]
  accounts: Account[]
  /** Offer Bank Messages as a source (only where messages can be read) */
  showBankMessages?: boolean
  /** Selected sources: statement IDs and BANK_MESSAGES_SOURCE */
  values: string[]
  onValuesChange: (sources: string[]) => void
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

export function SourceSelector({
  statements,
  accounts,
  showBankMessages = false,
  values,
  onValuesChange,
  accountIds,
  triggerClassName,
  contentClassName,
}: SourceSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { institutions } = useConstants()
  const navigation = useOptionNavigation(search)

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
    ? 'All sources'
    : values.length === 1 && values[0] === BANK_MESSAGES_SOURCE
      ? BANK_MESSAGES_LABEL
      : selectedStatement
        ? `${getStatementPeriodLabel(selectedStatement)} · ${getAccountLabel(selectedStatement)}`
        : `${values.length} sources`

  const showMessagesRow =
    showBankMessages &&
    (!search || BANK_MESSAGES_LABEL.toLowerCase().includes(search.trim().toLowerCase()))

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
      <PopoverContent className={cn('w-96 p-0', contentClassName)} align="start" {...navigation}>
        <div className="border-b border-border-subtle p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by month, account, file or messages..."
              data-option-search
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto p-1.5">
          {!search && (
            <StatementRow
              title="All sources"
              icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
              isSelected={!values.length}
              onClick={() => onValuesChange([])}
            />
          )}

          {showMessagesRow && (
            <StatementRow
              title={BANK_MESSAGES_LABEL}
              icon={<MessageSquareText className="h-4 w-4 text-muted-foreground" />}
              isSelected={values.includes(BANK_MESSAGES_SOURCE)}
              onClick={() => toggle(BANK_MESSAGES_SOURCE)}
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

          {!groups.length && !showMessagesRow && (
            <div className="py-6 text-center text-sm text-muted-foreground">No sources found</div>
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
      data-option
      data-selected={isSelected || undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors',
        'outline-none data-active:bg-surface-hover',
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
