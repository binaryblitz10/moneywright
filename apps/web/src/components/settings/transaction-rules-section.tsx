/**
 * Transaction rules section component
 * Rules set the name and/or category of transactions whose description contains any of their terms,
 * optionally limited to one direction and an amount range
 */

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Pencil, Plus, Repeat, Search, Trash2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { SectionCard } from '@/components/ui/section-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleCard } from '@/components/ui/toggle-card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CategoryPicker } from '@/components/transactions/category-picker'
import { TermChipsInput } from '@/components/transactions/term-chips-input'
import { AccountSelector } from '@/components/ui/account-selector'
import {
  AmountModeSelect,
  AmountRangeError,
  AmountValueInputs,
} from '@/components/transactions/amount-range-input'
import { amountRangeFromLimits, describeAmountLimits, toAmountLimits } from '@/lib/amount-range'
import {
  bulkUpdateTransactions,
  previewTransactionRule,
  type Account,
  type Category,
  type TransactionRule,
} from '@/lib/api'
import {
  useAccounts,
  useCategories,
  useTransactionRules,
  useRulePreview,
  useCreateTransactionRule,
  useUpdateTransactionRule,
  useDeleteTransactionRule,
  transactionKeys,
} from '@/hooks'
import { useQueryClient } from '@tanstack/react-query'
import { transactionRuleKeys } from '@/hooks/useTransactionRules'
import { CategoryIcon } from '@/components/ui/category-icon'
import { getCategoryColorClasses } from '@/lib/category-colors'
import { getAccountShortLabel } from '@/lib/statement-display'

type Direction = 'both' | 'credit' | 'debit'

const DIRECTION_LABELS: Record<Direction, string> = {
  both: 'Both',
  credit: 'Money in',
  debit: 'Money out',
}

/** Direction as shown on a rule in the list */
const ROW_DIRECTION_LABELS: Record<Direction, string> = {
  both: 'Money in & out',
  credit: 'Money in',
  debit: 'Money out',
}

const labelClass = 'text-xs font-medium text-muted-foreground uppercase tracking-wider'

function getAccountLabel(accounts: Account[] | undefined, id: string | null): string | null {
  const account = id ? accounts?.find((acc) => acc.id === id) : null
  return account ? getAccountShortLabel(account) : null
}

function getCategoryLabel(categories: Category[], code: string | null): string | null {
  if (!code) return null
  return categories.find((cat) => cat.code === code)?.label ?? code
}

export function TransactionRulesSection() {
  const { data: rules, isLoading } = useTransactionRules()
  const { data: categoriesData } = useCategories()
  const categories = categoriesData?.categories ?? []
  const { data: accounts } = useAccounts()
  const [editing, setEditing] = useState<TransactionRule | 'new' | null>(null)
  const [applying, setApplying] = useState<TransactionRule | null>(null)
  const [deleting, setDeleting] = useState<TransactionRule | null>(null)
  const [search, setSearch] = useState('')
  const deleteMutation = useDeleteTransactionRule()

  const filteredRules = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!rules || !query) return rules ?? []
    return rules.filter((rule) =>
      [
        rule.name,
        getCategoryLabel(categories, rule.category),
        getAccountLabel(accounts, rule.accountId),
        rule.isSubscription ? 'Subscription' : null,
        ...rule.matchTerms,
      ].some((value) => value?.toLowerCase().includes(query))
    )
  }, [rules, categories, accounts, search])

  return (
    <SectionCard
      title="Transaction Rules"
      description="Set the name or category of transactions that match any term. Applied before the AI."
      action={
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="mr-2 h-4 w-4" />
          Add rule
        </Button>
      }
      contentClassName="space-y-3"
    >
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !rules || rules.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-subtle py-6 text-center text-sm text-muted-foreground">
          No rules
        </p>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rules by term, name or category"
              aria-label="Search rules"
              data-page-search
              className="pl-9"
            />
          </div>
          {filteredRules.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border-subtle py-6 text-center text-sm text-muted-foreground">
              No matching rules
            </p>
          ) : (
            <div className="space-y-2">
              {filteredRules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  categories={categories}
                  accounts={accounts}
                  onEdit={() => setEditing(rule)}
                  onApply={() => setApplying(rule)}
                  onDelete={() => setDeleting(rule)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {editing && (
        <RuleDialog
          key={editing === 'new' ? 'new' : editing.id}
          rule={editing === 'new' ? null : editing}
          categories={categories}
          accounts={accounts ?? []}
          onClose={() => setEditing(null)}
        />
      )}

      {applying && (
        <ApplyRuleDialog
          rule={applying}
          categories={categories}
          onClose={() => setApplying(null)}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              Transactions already updated by this rule keep their name and category. Future imports
              will no longer use it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) deleteMutation.mutate(deleting.id)
                setDeleting(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  )
}

interface RuleRowProps {
  rule: TransactionRule
  categories: Category[]
  accounts: Account[] | undefined
  onEdit: () => void
  onApply: () => void
  onDelete: () => void
}

function RuleRow({ rule, categories, accounts, onEdit, onApply, onDelete }: RuleRowProps) {
  const direction: Direction = rule.transactionType ?? 'both'
  const categoryLabel = getCategoryLabel(categories, rule.category)
  const accountLabel = getAccountLabel(accounts, rule.accountId)
  const amountLabel = describeAmountLimits(rule.minAmount, rule.maxAmount)

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-elevated px-4 py-3">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className={cn('font-medium', !rule.name && 'text-muted-foreground font-normal')}>
            {rule.name ?? 'Keep name'}
          </span>
          <span className="text-muted-foreground">·</span>
          <span
            className={cn('flex items-center gap-1.5', !categoryLabel && 'text-muted-foreground')}
          >
            {rule.category && (
              <CategoryIcon
                code={rule.category}
                className={
                  getCategoryColorClasses(
                    categories.find((cat) => cat.code === rule.category)?.color ?? 'zinc'
                  ).text
                }
              />
            )}
            {categoryLabel ?? 'Keep category'}
          </span>
          {accountLabel && (
            <>
              <span className="text-muted-foreground">·</span>
              <span>{accountLabel}</span>
            </>
          )}
          {rule.isSubscription && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                <Repeat className="h-3 w-3" />
                Subscription
              </span>
            </>
          )}
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{ROW_DIRECTION_LABELS[direction]}</span>
          {amountLabel && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground tabular-nums">{amountLabel}</span>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {rule.matchTerms.map((term) => (
            <span
              key={term}
              className="inline-flex items-center rounded-md border border-border-subtle bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              <span className="max-w-37.5 truncate uppercase">{term}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 gap-0.5 text-muted-foreground">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Edit rule"
          onClick={onEdit}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Apply to existing transactions"
          title="Apply to existing transactions"
          disabled={rule.matchCount === 0 || (!rule.name && !rule.category && !rule.isSubscription)}
          onClick={onApply}
        >
          <Wand2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Delete rule"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

interface RuleDialogProps {
  rule: TransactionRule | null
  categories: Category[]
  accounts: Account[]
  onClose: () => void
}

function RuleDialog({ rule, categories, accounts, onClose }: RuleDialogProps) {
  const [terms, setTerms] = useState<string[]>(rule?.matchTerms ?? [])
  const [direction, setDirection] = useState<Direction>(rule?.transactionType ?? 'both')
  const [amountRange, setAmountRange] = useState(() =>
    amountRangeFromLimits(rule?.minAmount ?? null, rule?.maxAmount ?? null)
  )
  const [name, setName] = useState(rule?.name ?? '')
  const [category, setCategory] = useState(rule?.category ?? '')
  const [accountId, setAccountId] = useState<string | null>(rule?.accountId ?? null)
  const [isSubscription, setIsSubscription] = useState(rule?.isSubscription ?? false)
  const createMutation = useCreateTransactionRule()
  const updateMutation = useUpdateTransactionRule()

  const transactionType = direction === 'both' ? null : direction
  // Null while the amount filter is incomplete
  const amountLimits = toAmountLimits(amountRange)
  const { data: preview } = useRulePreview(
    { matchTerms: terms, transactionType, ...amountLimits },
    !!amountLimits
  )
  const count = terms.length > 0 ? (preview?.count ?? 0) : 0

  const trimmedName = name.trim()
  const isPending = createMutation.isPending || updateMutation.isPending
  const canSave =
    terms.length > 0 &&
    !!amountLimits &&
    (!!trimmedName || !!category || accountId !== null || isSubscription) &&
    !isPending

  const handleSubmit = () => {
    if (!amountLimits) return
    const data = {
      matchTerms: terms,
      transactionType,
      ...amountLimits,
      name: trimmedName || null,
      category: category || null,
      accountId: accountId,
      isSubscription,
    }
    const options = { onSuccess: onClose }
    if (rule) {
      updateMutation.mutate({ id: rule.id, data }, options)
    } else {
      createMutation.mutate(data, options)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[min(46rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{rule ? 'Edit Rule' : 'Add Rule'}</DialogTitle>
          <DialogDescription>
            Set the name, category and/or account of transactions that match any term
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="rule-dialog-terms" className={labelClass}>
              Description contains
            </Label>
            <TermChipsInput id="rule-dialog-terms" value={terms} onChange={setTerms} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="rule-direction" className={labelClass}>
                Direction
              </Label>
              <Select value={direction} onValueChange={(value) => setDirection(value as Direction)}>
                <SelectTrigger id="rule-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DIRECTION_LABELS) as Direction[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {DIRECTION_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rule-amount" className={labelClass}>
                Amount
              </Label>
              <AmountModeSelect
                id="rule-amount"
                value={amountRange}
                onChange={setAmountRange}
                className="w-full"
              />
            </div>
          </div>

          {amountRange.mode !== 'any' && (
            <div className="-mt-2 space-y-1.5">
              <div className="flex gap-2">
                <AmountValueInputs value={amountRange} onChange={setAmountRange} />
              </div>
              <AmountRangeError value={amountRange} />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="rule-name" className={labelClass}>
              Name (optional)
            </Label>
            <Input
              id="rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Leave empty to keep the name as is"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule-account" className={labelClass}>
              Account (optional)
            </Label>
            <AccountSelector
              accounts={accounts.filter((acc) => acc.isActive || acc.id === rule?.accountId)}
              value={accountId}
              onValueChange={setAccountId}
              showAllOption={false}
              clearLabel="No account"
              placeholder="Select account"
              contentClassName="w-(--radix-popover-trigger-width)"
              triggerClassName={cn(
                'w-full h-10 rounded-lg bg-background border-input hover:bg-background hover:border-border-hover',
                accountId === null && 'text-muted-foreground'
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule-category" className={labelClass}>
              Category (optional)
            </Label>
            <CategoryPicker
              id="rule-category"
              categories={categories}
              value={category}
              onChange={setCategory}
              triggerClassName="bg-background border-input hover:bg-background hover:border-border-hover"
              noneLabel="No category"
              placeholder="No category"
            />
          </div>

          <ToggleCard
            compact
            id="rule-subscription"
            icon={Repeat}
            title="Recurring subscription"
            description="Tracked on the Subscriptions page."
            checked={isSubscription}
            onCheckedChange={setIsSubscription}
          />

          {terms.length > 0 &&
            !trimmedName &&
            !category &&
            accountId === null &&
            !isSubscription && (
              <p className="text-xs text-muted-foreground">
                Set a name, category, account or subscription to save.
              </p>
            )}

          {terms.length > 0 && amountLimits && (
            <p className="text-sm text-muted-foreground">
              Matches {count} transaction{count === 1 ? '' : 's'}
            </p>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSubmit} disabled={!canSave}>
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : rule ? (
              'Save Changes'
            ) : (
              'Add Rule'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface ApplyRuleDialogProps {
  rule: TransactionRule
  categories: Category[]
  onClose: () => void
}

function ApplyRuleDialog({ rule, categories, onClose }: ApplyRuleDialogProps) {
  const queryClient = useQueryClient()
  const conditions = {
    matchTerms: rule.matchTerms,
    transactionType: rule.transactionType,
    minAmount: rule.minAmount,
    maxAmount: rule.maxAmount,
  }
  const { data: preview, isLoading } = useRulePreview(conditions)
  const count = preview?.count ?? 0

  const applyMutation = useMutation({
    mutationFn: async () => {
      // Fetch fresh ids so the update matches what the rule matches right now
      const { transactionIds } = await previewTransactionRule(conditions)
      return bulkUpdateTransactions({
        transactionIds,
        summary: rule.name ?? undefined,
        category: rule.category ?? undefined,
        isSubscription: rule.isSubscription || undefined,
        source: 'rule',
      })
    },
    onSuccess: ({ updatedCount }) => {
      queryClient.invalidateQueries({ queryKey: transactionKeys.all })
      queryClient.invalidateQueries({ queryKey: transactionRuleKeys.all })
      toast.success(`Updated ${updatedCount} transaction${updatedCount === 1 ? '' : 's'}`)
      onClose()
    },
    onError: () => toast.error('Failed to apply rule'),
  })

  const changes = [
    rule.name && `name to "${rule.name}"`,
    rule.category && `category to ${getCategoryLabel(categories, rule.category)}`,
    rule.isSubscription && 'subscription flag to on',
  ]
    .filter(Boolean)
    .join(' and ')

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Apply rule to existing transactions?</AlertDialogTitle>
          <AlertDialogDescription>
            {isLoading
              ? 'Counting matching transactions...'
              : `This will set the ${changes} on ${count} matching transaction${count === 1 ? '' : 's'}.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isLoading || count === 0 || applyMutation.isPending}
            onClick={(e) => {
              e.preventDefault()
              applyMutation.mutate()
            }}
          >
            {applyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
