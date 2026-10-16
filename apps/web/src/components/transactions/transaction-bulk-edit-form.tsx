import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBulkUpdateTransactions } from '@/hooks'
import type { Category, CategoryKind } from '@/lib/api'
import { CATEGORY_KIND_LABELS, CATEGORY_KIND_ORDER, categoriesOfKind } from '@/lib/category-kinds'

const NO_CHANGE = '__no_change__'

interface TransactionBulkEditFormProps {
  transactionIds: string[]
  categories: Category[]
  onClose: () => void
  onSuccess: () => void
}

export function TransactionBulkEditForm({
  transactionIds,
  categories,
  onClose,
  onSuccess,
}: TransactionBulkEditFormProps) {
  const [kind, setKind] = useState<string>(NO_CHANGE)
  const [category, setCategory] = useState(NO_CHANGE)
  const [summary, setSummary] = useState('')
  const [visibility, setVisibility] = useState(NO_CHANGE)
  const mutation = useBulkUpdateTransactions()

  const kindCategories =
    kind === NO_CHANGE ? [] : categoriesOfKind(categories, kind as CategoryKind)

  // Picking a label starts a fresh category choice
  const handleKindChange = (newKind: string) => {
    setKind(newKind)
    setCategory(NO_CHANGE)
  }

  const hasChanges = category !== NO_CHANGE || summary.trim() !== '' || visibility !== NO_CHANGE

  const handleSave = () => {
    mutation.mutate(
      {
        transactionIds,
        ...(category !== NO_CHANGE && { category }),
        ...(summary.trim() && { summary: summary.trim() }),
        ...(visibility !== NO_CHANGE && { isHidden: visibility === 'hidden' }),
      },
      { onSuccess }
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="bulk-summary">Summary</Label>
        <Input
          id="bulk-summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Leave empty to keep existing summaries"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="bulk-label">Label</Label>
        <Select value={kind} onValueChange={handleKindChange}>
          <SelectTrigger id="bulk-label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_CHANGE}>
              <span className="text-muted-foreground">No change</span>
            </SelectItem>
            {CATEGORY_KIND_ORDER.map((option) => (
              <SelectItem key={option} value={option}>
                {CATEGORY_KIND_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bulk-category">Category</Label>
        <Select
          value={kind !== NO_CHANGE && category === NO_CHANGE ? '' : category}
          onValueChange={setCategory}
          disabled={kind === NO_CHANGE}
        >
          <SelectTrigger id="bulk-category">
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent>
            {kind === NO_CHANGE ? (
              <SelectItem value={NO_CHANGE}>
                <span className="text-muted-foreground">Keep existing</span>
              </SelectItem>
            ) : (
              kindCategories.map((cat) => (
                <SelectItem key={cat.code} value={cat.code}>
                  {cat.label}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        {category !== NO_CHANGE && (
          <p className="text-xs text-muted-foreground">
            Loan, insurance and credit card links are removed from transactions whose category
            changes.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="bulk-visibility">Visibility</Label>
        <Select value={visibility} onValueChange={setVisibility}>
          <SelectTrigger id="bulk-visibility">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_CHANGE}>
              <span className="text-muted-foreground">Keep existing</span>
            </SelectItem>
            <SelectItem value="hidden">Hide from reports and calculations</SelectItem>
            <SelectItem value="visible">Unhide</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!hasChanges || mutation.isPending}>
          {mutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            `Update ${transactionIds.length} transaction${transactionIds.length === 1 ? '' : 's'}`
          )}
        </Button>
      </div>
    </div>
  )
}
