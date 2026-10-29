import { useState } from 'react'
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
import type { Budget, Category } from '@/lib/api'

const labelClass = 'text-xs font-medium text-muted-foreground uppercase tracking-wider'

interface BudgetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The budget being edited; leave out to add a new one */
  budget?: Budget
  /** Spending categories that don't have a budget yet (used when adding) */
  categories: Category[]
  isSaving: boolean
  onSave: (values: { category: string; monthlyAmount: number; rollover: boolean }) => void
}

export function BudgetDialog({
  open,
  onOpenChange,
  budget,
  categories,
  isSaving,
  onSave,
}: BudgetDialogProps) {
  const [category, setCategory] = useState(budget?.category ?? '')
  const [amount, setAmount] = useState(budget ? String(budget.monthlyAmount) : '')
  const [rollover, setRollover] = useState(budget?.rollover ?? false)

  const monthlyAmount = Number(amount)
  const canSave = !!category && monthlyAmount > 0 && !isSaving
  const handleSave = () => onSave({ category, monthlyAmount, rollover })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{budget ? `Edit ${budget.categoryLabel} budget` : 'Add budget'}</DialogTitle>
          <DialogDescription>
            {budget
              ? 'Change the monthly limit for this category.'
              : 'Set a monthly limit for a spending category.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!budget && (
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
            {budget ? 'Save' : 'Add budget'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
