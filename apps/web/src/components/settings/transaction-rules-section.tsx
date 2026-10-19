/**
 * Transaction rules section component
 * Rules set the name and/or category of transactions whose description contains all of their terms,
 * optionally limited to one direction and an amount range
 */

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Pencil, Plus, Trash2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { AmountRangeInput } from '@/components/transactions/amount-range-input'
import { amountRangeFromLimits, describeAmountLimits, toAmountLimits } from '@/lib/amount-range'
import {
  bulkUpdateTransactions,
  previewTransactionRule,
  type Category,
  type TransactionRule,
} from '@/lib/api'
import {
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

function getCategoryLabel(categories: Category[], code: string | null): string | null {
  if (!code) return null
  return categories.find((cat) => cat.code === code)?.label ?? code
}

export function TransactionRulesSection() {
  const { data: rules, isLoading } = useTransactionRules()
  const { data: categoriesData } = useCategories()
  const categories = categoriesData?.categories ?? []
  const [editing, setEditing] = useState<TransactionRule | 'new' | null>(null)
  const [applying, setApplying] = useState<TransactionRule | null>(null)
  const [deleting, setDeleting] = useState<TransactionRule | null>(null)
  const deleteMutation = useDeleteTransactionRule()

  return (
    <Card className="border-border-subtle hover:border-border-hover transition-colors animate-fade-in">
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Transaction Rules
          </CardTitle>
          <CardDescription className="text-xs">
            Set the name or category of transactions that match all terms. Applied before the AI.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="mr-2 h-4 w-4" />
          Add rule
        </Button>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !rules || rules.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-subtle py-6 text-center text-sm text-muted-foreground">
            No rules
          </p>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                categories={categories}
                onEdit={() => setEditing(rule)}
                onApply={() => setApplying(rule)}
                onDelete={() => setDeleting(rule)}
              />
            ))}
          </div>
        )}
      </CardContent>

      {editing && (
        <RuleDialog
          key={editing === 'new' ? 'new' : editing.id}
          rule={editing === 'new' ? null : editing}
          categories={categories}
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
    </Card>
  )
}

interface RuleRowProps {
  rule: TransactionRule
  categories: Category[]
  onEdit: () => void
  onApply: () => void
  onDelete: () => void
}

function RuleRow({ rule, categories, onEdit, onApply, onDelete }: RuleRowProps) {
  const direction: Direction = rule.transactionType ?? 'both'
  const categoryLabel = getCategoryLabel(categories, rule.category)
  const amountLabel = describeAmountLimits(rule.minAmount, rule.maxAmount)

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-elevated px-4 py-3">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className={cn('font-medium', !rule.name && 'text-muted-foreground font-normal')}>
            {rule.name ?? 'Keep name'}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className={cn(!categoryLabel && 'text-muted-foreground')}>
            {categoryLabel ?? 'Keep category'}
          </span>
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
          disabled={rule.matchCount === 0}
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
  onClose: () => void
}

function RuleDialog({ rule, categories, onClose }: RuleDialogProps) {
  const [terms, setTerms] = useState<string[]>(rule?.matchTerms ?? [])
  const [direction, setDirection] = useState<Direction>(rule?.transactionType ?? 'both')
  const [amountRange, setAmountRange] = useState(() =>
    amountRangeFromLimits(rule?.minAmount ?? null, rule?.maxAmount ?? null)
  )
  const [name, setName] = useState(rule?.name ?? '')
  const [category, setCategory] = useState(rule?.category ?? '')
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
  const canSave = terms.length > 0 && !!amountLimits && (!!trimmedName || !!category) && !isPending

  const handleSubmit = () => {
    if (!amountLimits) return
    const data = {
      matchTerms: terms,
      transactionType,
      ...amountLimits,
      name: trimmedName || null,
      category: category || null,
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{rule ? 'Edit Rule' : 'Add Rule'}</DialogTitle>
          <DialogDescription>
            Set the name and/or category of transactions that match every term
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="rule-dialog-terms" className={labelClass}>
              Description contains
            </Label>
            <TermChipsInput id="rule-dialog-terms" value={terms} onChange={setTerms} />
          </div>

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
            <AmountRangeInput id="rule-amount" value={amountRange} onChange={setAmountRange} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule-name" className={labelClass}>
              Name (optional)
            </Label>
            <Input
              id="rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Leave empty to keep the name as is"
              className="h-10 rounded-md border border-input bg-background px-3 py-2"
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
              noneLabel="No category"
              placeholder="No category"
            />
          </div>

          {terms.length > 0 && !trimmedName && !category && (
            <p className="text-xs text-muted-foreground">Set a name or a category to save.</p>
          )}

          {terms.length > 0 && amountLimits && (
            <p className="text-sm text-muted-foreground">
              Matches {count} transaction{count === 1 ? '' : 's'}
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-2">
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
