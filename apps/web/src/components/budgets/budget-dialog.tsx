import { useState } from 'react'
import { formatBudgetAmount } from './format'
import { Loader2, Repeat } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleCard } from '@/components/ui/toggle-card'
import { CategoryPicker } from '@/components/transactions/category-picker'
import { TOTAL_BUDGET_CATEGORY, type Budget, type Category } from '@/lib/api'

const labelClass = 'text-xs font-medium text-muted-foreground uppercase tracking-wider'

interface BudgetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The budget being edited; leave out to add a new one */
  budget?: Budget
  /** Add or edit the overall budget for all spending instead of a category's */
  total?: boolean
  /** With `total`: the sum of the category budgets, which the total can't go below */
  minTotal?: number
  currency?: string
  /** Spending categories that don't have a budget yet (used when adding) */
  categories: Category[]
  isSaving: boolean
  onSave: (values: { category: string; monthlyAmount: number; rollover: boolean }) => void
}

export function BudgetDialog({
  open,
  onOpenChange,
  budget,
  total = false,
  minTotal = 0,
  currency = 'INR',
  categories,
  isSaving,
  onSave,
}: BudgetDialogProps) {
  const [category, setCategory] = useState(total ? TOTAL_BUDGET_CATEGORY : (budget?.category ?? ''))
  const [amount, setAmount] = useState(budget ? String(budget.monthlyAmount) : '')
  const [rollover, setRollover] = useState(budget?.rollover ?? false)

  const monthlyAmount = Number(amount)
  const belowMin = total && monthlyAmount > 0 && monthlyAmount < minTotal
  const canSave = !!category && monthlyAmount > 0 && !belowMin && !isSaving
  const handleSave = () => onSave({ category, monthlyAmount, rollover })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            {total
              ? budget
                ? 'Edit total budget'
                : 'Set total budget'
              : budget
                ? `Edit ${budget.categoryLabel} budget`
                : 'Add budget'}
          </DialogTitle>
          <DialogDescription>
            {total
              ? 'The most you plan to spend in a month across all categories, including those with a budget of their own.'
              : budget
                ? 'Change the monthly limit for this category.'
                : 'Set a monthly limit for a spending category.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!budget && !total && (
            <div className="space-y-2">
              <Label htmlFor="budget-category" className={labelClass}>
                Category
              </Label>
              <CategoryPicker
                id="budget-category"
                categories={categories}
                hideKindFilter
                value={category}
                onChange={setCategory}
                triggerClassName="bg-background border-input hover:bg-background hover:border-border-hover"
                placeholder="Choose a spending category"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="budget-amount" className={labelClass}>
              Monthly limit
            </Label>
            <Input
              id="budget-amount"
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="e.g. 10000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canSave && handleSave()}
            />
            {belowMin && (
              <p className="text-xs text-negative">
                Your category budgets already add up to {formatBudgetAmount(minTotal, currency)}.
                Set the total to at least that.
              </p>
            )}
          </div>

          <ToggleCard
            id="budget-rollover"
            icon={Repeat}
            title="Carry over unspent money"
            description="Whatever you don't spend this month is added to next month's limit."
            checked={rollover}
            onCheckedChange={setRollover}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={!canSave}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {budget ? 'Save' : total ? 'Set budget' : 'Add budget'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
