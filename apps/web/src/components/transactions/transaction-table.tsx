import { Fragment, useRef, useState, type MouseEvent, type ReactNode } from 'react'
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
import {
  BadgeCheck,
  CreditCard,
  Landmark,
  Plus,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react'
import { CategoryPicker } from './category-picker'
import { useConstants, useUpdateTransaction } from '@/hooks'
import { cn } from '@/lib/utils'
import { getAccountShortLabel } from '@/lib/statement-display'
import type { Transaction, Account, Category, Profile } from '@/lib/api'
import { getProfileName } from '@/components/ui/profile-badge'
import { CategoryIcon } from '@/components/ui/category-icon'

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
  /** Whether a row can be selected (default: always) */
  isSelectable?: (transaction: Transaction) => boolean
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
  green:
    'bg-green-100 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20',
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
const NOTE_PREVIEW_LENGTH = 30

/** First line of a note, cut to a short preview */
function truncateNote(note: string): string {
  const line = (note.split('\n')[0] ?? '').trim()
  return line.length > NOTE_PREVIEW_LENGTH
    ? `${line.slice(0, NOTE_PREVIEW_LENGTH).trimEnd()}…`
    : line
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
  isSelectable,
}: TransactionTableProps) {
  const updateTransaction = useUpdateTransaction()
  const { institutions } = useConstants()
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
  const selectableRows = isSelectable ? transactions.filter(isSelectable) : transactions
  const selectedOnPage = selectable ? selectableRows.filter((t) => selectedIds.has(t.id)).length : 0
  const allOnPageSelected = selectableRows.length > 0 && selectedOnPage === selectableRows.length
  // Whenever selection is enabled, clicking anywhere on a row toggles it
  const rowClickSelects = selectable

  // ID of the last row clicked, used as the anchor for shift-click range selection
  const anchorIdRef = useRef<string | null>(null)

  const handleRowClick = (e: MouseEvent, index: number) => {
    if (!selectedIds || !onSelectionChange) return
    const id = transactions[index]!.id
    if (isSelectable && !isSelectable(transactions[index]!)) return
    const checked = !selectedIds.has(id)
    const anchorIndex = e.shiftKey
      ? transactions.findIndex((t) => t.id === anchorIdRef.current)
      : -1
    const [from, to] =
      anchorIndex >= 0 ? [anchorIndex, index].sort((a, b) => a - b) : [index, index]
    const next = new Set(selectedIds)
    for (const txn of transactions.slice(from, to! + 1).filter(isSelectable ?? (() => true))) {
      if (checked) next.add(txn.id)
      else next.delete(txn.id)
    }
    anchorIdRef.current = id
    onSelectionChange(next)
  }

  const togglePage = (checked: boolean) => {
    if (!selectedIds || !onSelectionChange) return
    const next = new Set(selectedIds)
    for (const txn of selectableRows) {
      if (checked) next.add(txn.id)
      else next.delete(txn.id)
    }
    onSelectionChange(next)
  }

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })

  const renderTitle = (txn: Transaction) => (
    <div className="flex items-center gap-2">
      <p className="truncate font-medium text-foreground text-sm">
        {txn.isManuallyCategorized && txn.summary
          ? txn.summary
          : toTitleCase(txn.summary || txn.originalDescription)}
      </p>
      {/* Matched with a statement line: just a checkmark */}
      {txn.smsVerified && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              role="img"
              aria-label="Verified against your statement"
              className="inline-flex shrink-0 transition-transform duration-200 group-hover:scale-110"
            >
              <BadgeCheck className="h-5 w-5 fill-emerald-500 text-white dark:text-background" />
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
  )

  const renderMeta = (
    txn: Transaction,
    account: Account | undefined,
    last4: string,
    institutionId: string
  ) => (
    <div className="flex items-center gap-2 mt-0.5">
      <AccountLabel
        label={
          account
            ? getAccountShortLabel(account, institutions[institutionId] || institutionId)
            : `••${last4}`
        }
        profileName={showProfileBadge && profiles ? getProfileName(txn.profileId, profiles) : null}
      />
      {txn.notes && (
        <>
          <span className="text-muted-foreground">·</span>
          <p className="shrink-0 text-xs italic text-muted-foreground">{truncateNote(txn.notes)}</p>
        </>
      )}
      {txn.summary && txn.summary !== txn.originalDescription && (
        <>
          <span className="text-muted-foreground">·</span>
          <p className="truncate text-xs text-muted-foreground">{txn.originalDescription}</p>
        </>
      )}
    </div>
  )

  const table = (
    <div className="hidden overflow-hidden rounded-xl border border-border-subtle bg-card md:block">
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
            <TableHead className="w-48 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Category
            </TableHead>
            <TableHead className="w-35 pr-6">
              <SortableHeading
                label="Amount"
                column="amount"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={onSortChange && handleSort}
                className="ml-auto"
              />
            </TableHead>
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
            const canEdit = isEditable?.(txn) ?? true

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
                    'hover:bg-surface-hover select-none',
                    (rowClickSelects || canEdit) && 'cursor-pointer',
                    selectable && selectedIds.has(txn.id) && 'bg-primary/5'
                  )}
                  // Selecting takes over clicks while selection is on, otherwise a click opens the editor
                  onClick={
                    rowClickSelects
                      ? (e) => handleRowClick(e, index)
                      : canEdit
                        ? () => onEditTransaction(txn)
                        : undefined
                  }
                  // Stop shift-click from highlighting text while range selecting
                  onMouseDown={selectable ? (e) => e.shiftKey && e.preventDefault() : undefined}
                >
                  {selectable &&
                    (!isSelectable || isSelectable(txn) ? (
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
                    ) : (
                      <TableCell className="py-3 pl-5" />
                    ))}
                  <TableCell
                    className={cn(
                      'text-sm text-muted-foreground whitespace-nowrap py-3',
                      !selectable && 'pl-5'
                    )}
                  >
                    {formatDate(txn.date)}
                  </TableCell>
                  <TableCell className="overflow-hidden py-3">
                    <div className="flex items-center gap-3">
                      <AccountAvatar
                        logoPath={logoPath}
                        institutionId={institutionId || 'other'}
                        isCard={account?.type === 'credit_card'}
                      />
                      <div className="min-w-0 flex-1">
                        {renderTitle(txn)}
                        {renderMeta(txn, account, last4, institutionId)}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <CategoryCell
                      transaction={txn}
                      categories={categories}
                      label={getCategoryLabel(txn.category)}
                      colorClass={getCategoryColor(txn.category)}
                      onChange={(category) =>
                        updateTransaction.mutate({ transactionId: txn.id, data: { category } })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap py-3 pr-6">
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
                </TableRow>
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )

  const list = (
    <div className="overflow-hidden rounded-xl border border-border-subtle bg-card md:hidden">
      {/* Sort and select-all controls, standing in for the table header */}
      <div className="flex items-center gap-4 border-b border-border-subtle bg-surface-elevated px-4 py-2.5">
        {selectable && (
          <Checkbox
            className={CHECKBOX_CLASS}
            aria-label="Select all transactions on this page"
            checked={allOnPageSelected ? true : selectedOnPage > 0 ? 'indeterminate' : false}
            onCheckedChange={(checked) => togglePage(checked === true)}
          />
        )}
        <SortableHeading
          label="Date"
          column="date"
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={onSortChange && handleSort}
        />
        <SortableHeading
          label="Amount"
          column="amount"
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={onSortChange && handleSort}
        />
      </div>
      {transactions.map((txn, index) => {
        const account = accountMap.get(txn.accountId)
        const last4 = (account?.accountNumber || '').slice(-4) || '****'
        const institutionId = account?.institution || ''
        const logoPath = institutionId ? `/institutions/${countryCode}/${institutionId}.svg` : null
        const groupHeader = renderGroupHeader?.(txn, index)
        const canEdit = isEditable?.(txn) ?? true
        const canSelect = selectable && (!isSelectable || isSelectable(txn))

        return (
          <Fragment key={`${txn.id}-${index}`}>
            {groupHeader && (
              <div className="border-b border-border-subtle bg-surface-elevated/60 px-4 py-2">
                {groupHeader}
              </div>
            )}
            <div
              className={cn(
                'flex select-none items-start gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0',
                (rowClickSelects || canEdit) && 'cursor-pointer active:bg-surface-hover',
                selectable && selectedIds.has(txn.id) && 'bg-primary/5'
              )}
              onClick={
                rowClickSelects
                  ? (e) => handleRowClick(e, index)
                  : canEdit
                    ? () => onEditTransaction(txn)
                    : undefined
              }
            >
              {canSelect && (
                <Checkbox
                  className={cn(CHECKBOX_CLASS, 'mt-2.5')}
                  aria-label="Select transaction"
                  checked={selectedIds.has(txn.id)}
                />
              )}
              <AccountAvatar
                logoPath={logoPath}
                institutionId={institutionId || 'other'}
                isCard={account?.type === 'credit_card'}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">{renderTitle(txn)}</div>
                  <span
                    className={cn(
                      'shrink-0 text-sm font-semibold tabular-nums',
                      txn.type === 'credit' ? 'text-positive' : 'text-foreground'
                    )}
                  >
                    {txn.type === 'credit' ? '+' : '-'}
                    {formatAmount(txn.amount, txn.currency)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                    <CategoryCell
                      transaction={txn}
                      categories={categories}
                      label={getCategoryLabel(txn.category)}
                      colorClass={getCategoryColor(txn.category)}
                      onChange={(category) =>
                        updateTransaction.mutate({ transactionId: txn.id, data: { category } })
                      }
                    />
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(txn.date)}
                  </span>
                </div>
                <div className="mt-1">{renderMeta(txn, account, last4, institutionId)}</div>
              </div>
            </div>
          </Fragment>
        )
      })}
    </div>
  )

  return (
    <>
      {list}
      {table}
    </>
  )
}

// Drops the preset background classes so the pill's own tint can be set instead
function withoutBackground(classes: string | undefined): string | undefined {
  return classes
    ?.split(' ')
    .filter((c) => !/(^|:)bg-/.test(c))
    .join(' ')
}

// Categories that mean "nobody has picked one yet"
const PLACEHOLDER_CATEGORIES = new Set(['other', 'other_income'])

// Category pill, or a dashed add button while a row has none. Click to pick a category
function CategoryCell({
  transaction,
  categories,
  label,
  colorClass,
  onChange,
}: {
  transaction: Transaction
  categories: Category[]
  label: string
  colorClass: string | undefined
  onChange: (category: string) => void
}) {
  const uncategorized =
    !transaction.isManuallyCategorized &&
    (!transaction.category ||
      PLACEHOLDER_CATEGORIES.has(transaction.category) ||
      !categories.some((c) => c.code === transaction.category))

  const pill = (
    <button
      type="button"
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        'cursor-pointer transition-[color,background-color,box-shadow]',
        uncategorized
          ? 'border-dashed border-border-hover bg-transparent text-muted-foreground hover:bg-surface-hover hover:text-foreground'
          : cn(
              withoutBackground(colorClass),
              // Pale tint of the pill's own colour that deepens on hover
              'bg-current/[0.08] hover:bg-current/[0.16] dark:bg-current/10 dark:hover:bg-current/25'
            )
      )}
    >
      {uncategorized ? (
        <>
          <Plus className="h-2.5 w-2.5 shrink-0" />
          Add category
        </>
      ) : (
        <>
          <CategoryIcon code={transaction.category} className="h-3 w-3" />
          <span className="truncate">{label}</span>
        </>
      )}
    </button>
  )

  return (
    <CategoryPicker
      categories={categories}
      value={transaction.category}
      onChange={onChange}
      trigger={pill}
      contentAlign="end"
      contentClassName="w-[26rem] max-w-[calc(100vw-2rem)]"
    />
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

// Round badge with the account's bank logo, or a card / bank icon when there is no logo
function AccountAvatar({
  logoPath,
  institutionId,
  isCard,
}: {
  logoPath: string | null
  institutionId: string
  isCard: boolean
}) {
  const [logoError, setLogoError] = useState(false)
  const Icon = isCard ? CreditCard : Landmark

  return (
    <div
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-subtle',
        'transition-transform duration-200 group-hover:scale-105',
        // Bank logos are drawn for light backgrounds
        logoPath && !logoError ? 'bg-white' : 'bg-surface-elevated'
      )}
      aria-hidden="true"
    >
      {logoPath && !logoError ? (
        <img
          src={logoPath}
          alt={institutionId}
          className="h-5 w-5 object-contain"
          onError={() => setLogoError(true)}
        />
      ) : (
        <Icon className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  )
}

function AccountLabel({ label, profileName }: { label: string; profileName?: string | null }) {
  return (
    <span className="shrink-0 text-xs text-muted-foreground">
      {profileName ? `${profileName}'s ` : ''}
      {label}
    </span>
  )
}
