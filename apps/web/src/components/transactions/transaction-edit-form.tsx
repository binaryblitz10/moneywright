import { useState, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, EyeOff, Link2, Trash2, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CategoryPicker } from './category-picker'
import { ApplyToMatching, type ApplyToMatchingState } from './apply-to-matching'
import { ANY_AMOUNT, toAmountLimits } from '@/lib/amount-range'
import {
  updateTransaction,
  bulkUpdateTransactions,
  createTransactionRule,
  previewTransactionRule,
  type Transaction,
  type Category,
} from '@/lib/api'
import { suggestTerm } from '@/lib/suggest-term'
import {
  useLoans,
  useInsurancePolicies,
  useAccounts,
  useBulkDeleteTransactions,
  useRulePreview,
} from '@/hooks'
import { transactionKeys } from '@/hooks/useTransactions'
import { transactionRuleKeys } from '@/hooks/useTransactionRules'

// Categories that support entity linking
const LINKABLE_CATEGORIES = {
  emi: 'loan',
  insurance: 'insurance',
  credit_card_payment: 'credit_card',
} as const

type LinkableCategory = keyof typeof LINKABLE_CATEGORIES

/**
 * Edit one transaction (`transaction`) or several at once (`transactionIds`).
 * When editing several, untouched fields keep each transaction's own value.
 */
type TransactionEditFormProps = {
  categories: Category[]
  onClose: () => void
  onSuccess: () => void
} & ({ transaction: Transaction } | { transactionIds: string[] })

export function TransactionEditForm(props: TransactionEditFormProps) {
  const { categories, onClose, onSuccess } = props
  const single = 'transaction' in props ? props.transaction : null
  const transactionIds = single
    ? [single.id]
    : (props as { transactionIds: string[] }).transactionIds
  const count = transactionIds.length

  // Bulk: empty category / summary and a null hidden state mean "keep existing"
  const [category, setCategory] = useState(single?.category ?? '')
  const [summary, setSummary] = useState(single?.summary ?? '')
  const [isHidden, setIsHidden] = useState<boolean | null>(single ? single.isHidden : null)
  const [linkedEntityId, setLinkedEntityId] = useState<string | null>(
    single?.linkedEntityId ?? null
  )
  const [confirmDelete, setConfirmDelete] = useState(false)
  const queryClient = useQueryClient()

  // Name and category values to apply: only the ones that were changed
  const trimmedSummary = summary.trim()
  const summaryChange = single
    ? trimmedSummary !== (single.summary || '') && trimmedSummary
      ? trimmedSummary
      : undefined
    : trimmedSummary || undefined
  const categoryChange = single
    ? category !== single.category
      ? category
      : undefined
    : category || undefined
  const hasNameOrCategoryChange = summaryChange !== undefined || categoryChange !== undefined
  const hasChanges = single ? !!category : hasNameOrCategoryChange || isHidden !== null

  // "Create Rule" is offered once the name or category is changed
  // Adding any term means the user wants a rule, so nothing is prefilled; the suggestion is one click
  const [applyState, setApplyState] = useState<ApplyToMatchingState>({
    terms: [],
    amount: ANY_AMOUNT,
    updateExisting: true,
  })
  const suggestedTerm = single ? suggestTerm(single.originalDescription, single.summary) : ''
  const hasTerms = applyState.terms.length > 0
  // Null while the amount filter is incomplete; the rule can't be saved until it is
  const amountLimits = toAmountLimits(applyState.amount)
  const ruleIncomplete = hasNameOrCategoryChange && hasTerms && !amountLimits
  const { data: preview, isFetching: isPreviewFetching } = useRulePreview(
    { matchTerms: applyState.terms, ...amountLimits },
    hasNameOrCategoryChange && !!amountLimits
  )
  // Matches outside the transactions being edited, which are updated anyway
  const editedIds = new Set(transactionIds)
  const matchingCount = hasTerms
    ? (preview?.transactionIds ?? []).filter((id) => !editedIds.has(id)).length
    : 0
  const matchingSamples = (hasTerms ? (preview?.samples ?? []) : [])
    .filter((sample) => !editedIds.has(sample.id))
    .slice(0, 3)
    .map((sample) => sample.originalDescription)

  // Entity linking is only offered when editing a single transaction
  const isLinkableCategory = !!single && category in LINKABLE_CATEGORIES
  const entityType = isLinkableCategory ? LINKABLE_CATEGORIES[category as LinkableCategory] : null

  // Fetch entities based on category - use family view (no profileId filter)
  // to allow linking to any entity the user owns
  const { data: loans, isLoading: loansLoading } = useLoans(undefined, {
    status: 'active',
    enabled: entityType === 'loan',
  })

  const { data: insurancePolicies, isLoading: insuranceLoading } = useInsurancePolicies(undefined, {
    status: 'active',
    enabled: entityType === 'insurance',
  })

  const { data: accounts, isLoading: accountsLoading } = useAccounts(undefined, {
    enabled: entityType === 'credit_card',
  })

  // Filter to only credit card accounts
  const creditCards = useMemo(
    () => accounts?.filter((a) => a.type === 'credit_card') || [],
    [accounts]
  )

  // Get the appropriate entity list based on category
  const entityOptions = useMemo(() => {
    if (entityType === 'loan' && loans) {
      return loans.map((loan) => ({
        id: loan.id,
        label: `${loan.lender} - ${loan.loanType.replace(/_/g, ' ')}`,
        sublabel: loan.loanAccountNumber ? `••${loan.loanAccountNumber.slice(-4)}` : undefined,
      }))
    }
    if (entityType === 'insurance' && insurancePolicies) {
      return insurancePolicies.map((policy) => ({
        id: policy.id,
        label: `${policy.provider} - ${policy.policyType.replace(/_/g, ' ')}`,
        sublabel: policy.policyNumber ? `#${policy.policyNumber.slice(-6)}` : undefined,
      }))
    }
    if (entityType === 'credit_card' && creditCards) {
      return creditCards.map((card) => ({
        id: card.id,
        label: card.accountName,
        sublabel: card.accountNumber ? `••${card.accountNumber.slice(-4)}` : undefined,
      }))
    }
    return []
  }, [entityType, loans, insurancePolicies, creditCards])

  const isLoadingEntities = loansLoading || insuranceLoading || accountsLoading

  // Get entity type label for UI
  const entityTypeLabel = useMemo(() => {
    if (entityType === 'loan') return 'Loan'
    if (entityType === 'insurance') return 'Insurance Policy'
    if (entityType === 'credit_card') return 'Credit Card'
    return 'Entity'
  }, [entityType])

  // Handle category change - reset linked entity if category changes
  const handleCategoryChange = (newCategory: string) => {
    setCategory(newCategory)
    // Clear linked entity if category changes away from linkable type
    // or to a different linkable type
    if (
      !(newCategory in LINKABLE_CATEGORIES) ||
      (category in LINKABLE_CATEGORIES &&
        LINKABLE_CATEGORIES[category as LinkableCategory] !==
          LINKABLE_CATEGORIES[newCategory as LinkableCategory])
    ) {
      setLinkedEntityId(null)
    }
  }

  // Update matching transactions and save the rule; failures are reported but don't undo the edit
  const applyToMatching = async () => {
    if (!hasNameOrCategoryChange || !hasTerms || !amountLimits) return

    if (applyState.updateExisting) {
      try {
        // Fetch matches for the current terms: the debounced preview may still be for older ones
        const { transactionIds: matchIds } = await previewTransactionRule({
          matchTerms: applyState.terms,
          ...amountLimits,
        })
        const otherIds = matchIds.filter((id) => !editedIds.has(id))
        if (otherIds.length > 0) {
          await bulkUpdateTransactions({
            transactionIds: otherIds,
            summary: summaryChange,
            category: categoryChange,
          })
          toast.success(
            `Updated ${otherIds.length} matching transaction${otherIds.length === 1 ? '' : 's'}`
          )
        }
      } catch {
        toast.error('Failed to update matching transactions')
      }
    }

    try {
      await createTransactionRule({
        matchTerms: applyState.terms,
        name: trimmedSummary || null,
        category: category || null,
        transactionType: null,
        ...amountLimits,
      })
      queryClient.invalidateQueries({ queryKey: transactionRuleKeys.all })
      toast.success('Rule saved')
    } catch {
      toast.error('Failed to save rule')
    }
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (single) {
        await updateTransaction(single.id, {
          category,
          summary: summary || undefined,
          isHidden: isHidden ?? undefined,
          linkedEntityId,
          linkedEntityType: linkedEntityId && entityType ? entityType : null,
        })
      } else {
        await bulkUpdateTransactions({
          transactionIds,
          category: categoryChange,
          summary: summaryChange,
          ...(isHidden !== null && { isHidden }),
        })
      }

      await applyToMatching()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transactionKeys.all })
      // Category changes can change or drop entity links
      queryClient.invalidateQueries({ queryKey: ['loans'] })
      queryClient.invalidateQueries({ queryKey: ['insurance'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success(
        single ? 'Transaction updated' : `Updated ${count} transaction${count === 1 ? '' : 's'}`
      )
      onSuccess()
    },
    onError: () => {
      toast.error(single ? 'Failed to update transaction' : 'Failed to update transactions')
    },
  })

  const deleteMutation = useBulkDeleteTransactions()

  const handleDelete = () => {
    setConfirmDelete(false)
    deleteMutation.mutate(transactionIds, { onSuccess })
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="space-y-2">
        <Label htmlFor="summary">Summary</Label>
        <Input
          id="summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder={single ? 'Brief description' : 'Leave empty to keep existing summaries'}
          className="h-10 rounded-md border border-input bg-background px-3 py-2"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <CategoryPicker
          id="category"
          categories={categories}
          value={category}
          onChange={handleCategoryChange}
          {...(!single && { noneLabel: 'Keep existing', placeholder: 'Keep existing' })}
        />
        {!single && category && (
          <p className="text-xs text-muted-foreground">
            Loan, insurance and credit card links are removed from transactions whose category
            changes.
          </p>
        )}
      </div>

      {/* Entity Linking Section - Only show for linkable categories */}
      {isLinkableCategory && (
        <div className="space-y-2">
          <Label htmlFor="linked-entity" className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Link to {entityTypeLabel}
          </Label>
          <Select
            value={linkedEntityId || '__none__'}
            onValueChange={(value) => setLinkedEntityId(value === '__none__' ? null : value)}
            disabled={isLoadingEntities}
          >
            <SelectTrigger id="linked-entity">
              <SelectValue
                placeholder={isLoadingEntities ? 'Loading...' : `Select ${entityTypeLabel}`}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Unlink className="h-4 w-4" />
                  Not linked
                </span>
              </SelectItem>
              {entityOptions.map((entity) => (
                <SelectItem key={entity.id} value={entity.id}>
                  <span className="flex items-center gap-2">
                    {entity.label}
                    {entity.sublabel && (
                      <span className="text-muted-foreground text-xs">{entity.sublabel}</span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Linking helps track payments and calculate outstanding balances.
          </p>
        </div>
      )}

      {hasNameOrCategoryChange && (
        <ApplyToMatching
          state={applyState}
          onChange={setApplyState}
          suggestedTerm={suggestedTerm}
          totalCount={hasTerms ? (preview?.count ?? 0) : 0}
          count={matchingCount}
          samples={matchingSamples}
          isFetching={isPreviewFetching}
        />
      )}

      <div className="flex items-center justify-between rounded-lg border p-4 mt-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <EyeOff className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="hide-transaction" className="font-medium">
              {single ? 'Hide Transaction' : 'Hide Transactions'}
            </Label>
          </div>
          <p className="text-sm text-muted-foreground">
            {isHidden === null
              ? 'Leave untouched to keep each transaction as it is.'
              : 'Hidden transactions are excluded from all reports, charts, and calculations.'}
          </p>
        </div>
        <Switch id="hide-transaction" checked={isHidden ?? false} onCheckedChange={setIsHidden} />
      </div>

      <div className="flex items-center justify-between gap-2 pt-4">
        <Button
          variant="destructive"
          onClick={() => setConfirmDelete(true)}
          disabled={deleteMutation.isPending || updateMutation.isPending}
        >
          {deleteMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="mr-2 h-4 w-4" />
          )}
          Delete
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => updateMutation.mutate()}
            disabled={
              !hasChanges || ruleIncomplete || updateMutation.isPending || deleteMutation.isPending
            }
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {single
                ? 'Permanently delete this transaction?'
                : `Permanently delete ${count} transaction${count === 1 ? '' : 's'}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {single
                ? "This can't be undone. To keep it but exclude it from totals, hide it instead."
                : "This can't be undone. To keep them but exclude them from totals, hide them instead."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
