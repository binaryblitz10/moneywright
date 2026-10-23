import { Fragment, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Check, Pencil, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Transaction, Account, Category, Profile } from '@/lib/api'
import { getProfileName } from '@/components/ui/profile-badge'

// Roomier box with a smaller tick so there's padding between the tick and the circle
const CHECKBOX_CLASS = 'size-5 [&_svg]:size-3'

export type SortBy = 'date' | 'amount'
export type SortOrder = 'asc' | 'desc'

interface TransactionTableProps {
  transactions: Transaction[]
  accounts: Account[]
  categories: Category[]
  countryCode: string
  onEditTransaction: (transaction: Transaction) => void
  getCategoryLabel: (code: string) => string
  formatAmount: (amount: number, currency: string) => string
  sortBy?: SortBy
  sortOrder?: SortOrder
  onSortChange?: (sortBy: SortBy, sortOrder: SortOrder) => void
  /** Profiles list for showing profile badge in family view */
  profiles?: Profile[]
  /** Whether to show profile badge (family view mode) */
  showProfileBadge?: boolean
  /** IDs of selected transactions (enables the selection column) */
  selectedIds?: Set<string>
  onSelectionChange?: (selectedIds: Set<string>) => void
  /** Renders a full-width heading row above a transaction; return null for no heading */
  renderGroupHeader?: (transaction: Transaction, index: number) => ReactNode
  /** Extra badge shown after the name and category; return null for none */
  renderBadge?: (transaction: Transaction) => ReactNode
  /** Whether the edit button is offered for a row (default: always) */
  isEditable?: (transaction: Transaction) => boolean
}

// Sort indicator component
function SortIndicator({
  column,
  sortBy,
  sortOrder,
}: {
  column: SortBy
  sortBy: SortBy
  sortOrder: SortOrder
}) {
  if (sortBy !== column) {
    return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
  }
  return sortOrder === 'asc' ? (
    <ArrowUp className="h-3.5 w-3.5 text-primary" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5 text-primary" />
  )
}

// Map color names to Tailwind classes (light + dark mode aware)
const colorStyles: Record<string, string> = {
  emerald:
    'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  orange:
    'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20',
  lime: 'bg-lime-100 text-lime-700 border-lime-200 dark:bg-lime-500/10 dark:text-lime-400 dark:border-lime-500/20',
  blue: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
  cyan: 'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20',
  purple:
    'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20',
  amber:
    'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  pink: 'bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-500/10 dark:text-pink-400 dark:border-pink-500/20',
  sky: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20',
  red: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
  fuchsia:
    'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-500/10 dark:text-fuchsia-400 dark:border-fuchsia-500/20',
  indigo:
    'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20',
  slate:
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20',
  violet:
    'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20',
  teal: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-400 dark:border-teal-500/20',
  rose: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
  zinc: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-500/10 dark:text-zinc-400 dark:border-zinc-500/20',
}

/** First letter of a transaction's name, uppercased; "?" when there is none */
function getNameInitial(name: string): string {
  const letter = name.trim().charAt(0)
  return letter ? letter.toUpperCase() : '?'
}

/**
 * Title Case a transaction name. Mixed-case words (YouTube) and short all-caps words
 * (IRCTC, LIC) are kept; lowercase and long all-caps words are capitalised.
 */
function toTitleCase(name: string): string {
  return name.replace(/\S+/g, (word) => {
    const isLower = word === word.toLowerCase()
    const isLongUpper = word === word.toUpperCase() && word.replace(/[^A-Za-z]/g, '').length > 5
    if (!isLower && !isLongUpper) return word
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  })
}

export function TransactionTable({
  transactions,
  accounts,
  categories,
  countryCode,
  onEditTransaction,
  getCategoryLabel,
  formatAmount,
  sortBy = 'date',
  sortOrder = 'desc',
  onSortChange,
  profiles,
  showProfileBadge,
  selectedIds,
  onSelectionChange,
  renderGroupHeader,
  renderBadge,
  isEditable,
}: TransactionTableProps) {
  const accountMap = new Map(accounts?.map((a) => [a.id, a]) || [])
  const categoryMap = new Map(categories?.map((c) => [c.code, c]) || [])

  const getCategoryColor = (code: string) => {
    const category = categoryMap.get(code)
    return colorStyles[category?.color || 'zinc'] || colorStyles.zinc
  }

  const handleSort = (column: SortBy) => {
    if (!onSortChange) return
    if (sortBy === column) {
      // Toggle order
      onSortChange(column, sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      // New column, default to desc
      onSortChange(column, 'desc')
    }
  }

  const selectable = !!selectedIds && !!onSelectionChange
  const selectedOnPage = selectable ? transactions.filter((t) => selectedIds.has(t.id)).length : 0
  const allOnPageSelected = transactions.length > 0 && selectedOnPage === transactions.length
  // Clicking anywhere on a row only selects once a selection has been started via a checkbox
  const rowClickSelects = selectable && selectedIds.size > 0

  // ID of the last row clicked, used as the anchor for shift-click range selection
  const anchorIdRef = useRef<string | null>(null)

  const handleRowClick = (e: MouseEvent, index: number) => {
    if (!selectedIds || !onSelectionChange) return
    const id = transactions[index]!.id
    const checked = !selectedIds.has(id)
    const anchorIndex = e.shiftKey
      ? transactions.findIndex((t) => t.id === anchorIdRef.current)
      : -1
    const [from, to] =
      anchorIndex >= 0 ? [anchorIndex, index].sort((a, b) => a - b) : [index, index]
    const next = new Set(selectedIds)
    for (const txn of transactions.slice(from, to! + 1)) {
      if (checked) next.add(txn.id)
      else next.delete(txn.id)
    }
    anchorIdRef.current = id
    onSelectionChange(next)
  }

  const togglePage = (checked: boolean) => {
    if (!selectedIds || !onSelectionChange) return
    const next = new Set(selectedIds)
    for (const txn of transactions) {
      if (checked) next.add(txn.id)
      else next.delete(txn.id)
    }
    onSelectionChange(next)
  }

  return (
    <div className="rounded-xl overflow-hidden border border-border-subtle bg-card">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="bg-surface-elevated hover:bg-surface-elevated border-b border-border-subtle">
            {selectable && (
              <TableHead className="w-14 pl-5">
                <Checkbox
                  className={CHECKBOX_CLASS}
                  aria-label="Select all transactions on this page"
                  checked={allOnPageSelected ? true : selectedOnPage > 0 ? 'indeterminate' : false}
                  onCheckedChange={(checked) => togglePage(checked === true)}
                />
              </TableHead>
            )}
            <TableHead className={cn('w-27.5', !selectable && 'w-32 pl-5')}>
              <SortableHeading
                label="Date"
                column="date"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={onSortChange && handleSort}
              />
            </TableHead>
            <TableHead className="w-auto text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Description
            </TableHead>
            <TableHead className="w-35">
              <SortableHeading
                label="Amount"
                column="amount"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={onSortChange && handleSort}
                className="ml-auto"
              />
            </TableHead>
            <TableHead className="w-11"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((txn, index) => {
            const account = accountMap.get(txn.accountId)
            const accountNumber = account?.accountNumber || ''
            const last4 = accountNumber.slice(-4) || '****'
            const institutionId = account?.institution || ''
            const logoPath = institutionId
              ? `/institutions/${countryCode}/${institutionId}.svg`
              : null

            const groupHeader = renderGroupHeader?.(txn, index)

            return (
              <Fragment key={`${txn.id}-${index}`}>
                {groupHeader && (
                  <TableRow className="border-b border-border-subtle bg-surface-elevated/60 hover:bg-surface-elevated/60">
                    <TableCell colSpan={selectable ? 5 : 4} className="py-2 pl-5">
                      {groupHeader}
                    </TableCell>
                  </TableRow>
                )}
                <TableRow
                  className={cn(
                    'group transition-all duration-200 border-b border-border-subtle last:border-b-0',
                    'hover:bg-surface-hover',
                    rowClickSelects && 'cursor-pointer',
                    selectable && selectedIds.has(txn.id) && 'bg-primary/5'
                  )}
                  onClick={rowClickSelects ? (e) => handleRowClick(e, index) : undefined}
                  // Stop shift-click from highlighting text while range selecting
                  onMouseDown={selectable ? (e) => e.shiftKey && e.preventDefault() : undefined}
                >
                  {selectable && (
                    <TableCell
                      className="py-3 pl-5 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRowClick(e, index)
                      }}
                    >
                      <Checkbox
                        className={CHECKBOX_CLASS}
                        aria-label="Select transaction"
                        checked={selectedIds.has(txn.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell
                    className={cn(
                      'text-sm text-muted-foreground whitespace-nowrap py-3',
                      !selectable && 'pl-5'
                    )}
                  >
                    {new Date(txn.date).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: '2-digit',
                    })}
                  </TableCell>
                  <TableCell className="overflow-hidden py-3">
                    <div className="flex items-center gap-3">
                      {/* Letter badge: first letter of the name, tinted with the category colour */}
                      <div
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border',
                          'text-sm font-semibold transition-transform duration-200 group-hover:scale-105',
                          getCategoryColor(txn.category)
                        )}
                        aria-hidden="true"
                      >
                        {getNameInitial(txn.summary || txn.originalDescription)}
                      </div>
                      <div className="min-w-0 flex-1">
                        {/* Title row with category badge inline */}
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium text-foreground text-sm">
                            {toTitleCase(txn.summary || txn.originalDescription)}
                          </p>
                          {/* Category badge - inline */}
                          <span
                            className={cn(
                              'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0',
                              'transition-transform duration-200 group-hover:scale-105',
                              getCategoryColor(txn.category)
                            )}
                          >
                            {getCategoryLabel(txn.category)}
                          </span>
                          {/* Matched with a statement line: just a checkmark */}
                          {txn.smsVerified && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  role="img"
                                  aria-label="Verified against your statement"
                                  className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-100 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20 shrink-0 transition-transform duration-200 group-hover:scale-110"
                                >
                                  <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                Verified against your statement
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {/* Imported from an SMS alert, not yet seen on a statement */}
                          {txn.smsSource && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border border-border-subtle text-muted-foreground shrink-0">
                              SMS
                            </span>
                          )}
                          {renderBadge?.(txn)}
                          {/* Subscription indicator */}
                          {txn.isSubscription && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-violet-100 border border-violet-200 dark:bg-violet-500/10 dark:border-violet-500/20 shrink-0 transition-transform duration-200 group-hover:scale-110">
                                  <RefreshCw className="h-2.5 w-2.5 text-violet-600 dark:text-violet-400" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                Recurring subscription
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        {/* Meta row */}
                        <div className="flex items-center gap-2 mt-0.5">
                          <AccountLogo
                            logoPath={logoPath}
                            institutionId={institutionId || 'other'}
                            last4={last4}
                            profileName={
                              showProfileBadge && profiles
                                ? getProfileName(txn.profileId, profiles)
                                : null
                            }
                          />
                          {txn.summary && txn.summary !== txn.originalDescription && (
                            <>
                              <span className="text-muted-foreground">·</span>
                              <p className="truncate text-xs text-muted-foreground">
                                {txn.originalDescription}
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap py-3">
                    <span
                      className={cn(
                        'font-semibold tabular-nums text-sm transition-colors duration-200',
                        txn.type === 'credit' ? 'text-positive' : 'text-foreground'
                      )}
                    >
                      {txn.type === 'credit' ? '+' : '-'}
                      {formatAmount(txn.amount, txn.currency)}
                    </span>
                  </TableCell>
                  <TableCell className="py-3">
                    {(isEditable?.(txn) ?? true) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-all duration-200 text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation()
                          onEditTransaction(txn)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// Column heading that only becomes a sort button when sorting is supported
function SortableHeading({
  label,
  column,
  sortBy,
  sortOrder,
  onSort,
  className,
}: {
  label: string
  column: SortBy
  sortBy: SortBy
  sortOrder: SortOrder
  onSort?: (column: SortBy) => void
  className?: string
}) {
  const base = 'flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider'
  if (!onSort) {
    return <div className={cn(base, 'w-fit text-muted-foreground', className)}>{label}</div>
  }
  return (
    <button
      onClick={() => onSort(column)}
      className={cn(
        base,
        'transition-colors hover:text-foreground',
        sortBy === column ? 'text-foreground' : 'text-muted-foreground',
        className
      )}
    >
      {label}
      <SortIndicator column={column} sortBy={sortBy} sortOrder={sortOrder} />
    </button>
  )
}

function AccountLogo({
  logoPath,
  institutionId,
  last4,
  profileName,
}: {
  logoPath: string | null
  institutionId: string
  last4: string
  profileName?: string | null
}) {
  const [logoError, setLogoError] = useState(false)

  return (
    <div className="flex items-center gap-1.5">
      <div className="h-5 w-5 rounded bg-surface flex items-center justify-center overflow-hidden shrink-0 border border-border-subtle">
        {logoPath && !logoError ? (
          <img
            src={logoPath}
            alt={institutionId}
            className="h-3.5 w-3.5 object-contain"
            onError={() => setLogoError(true)}
          />
        ) : (
          <span className="text-[9px] font-medium text-muted-foreground">
            {institutionId.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        {profileName ? `${profileName}'s ` : ''}••{last4}
      </span>
    </div>
  )
}
