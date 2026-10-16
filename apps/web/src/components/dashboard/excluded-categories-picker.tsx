/**
 * Picker for the categories excluded from every income and expense figure
 */

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Category } from '@/lib/api'
import { CATEGORY_KIND_LABELS, categoriesOfKind } from '@/lib/category-kinds'

interface ExcludedCategoriesPickerProps {
  /** Income and expense categories only */
  categories: Category[]
  excluded: string[]
  onToggle: (categoryCode: string) => void
  onClear: () => void
}

const PICKER_KINDS = ['income', 'expense'] as const

export function ExcludedCategoriesPicker({
  categories,
  excluded,
  onToggle,
  onClear,
}: ExcludedCategoriesPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-8 text-xs text-muted-foreground hover:text-foreground',
            excluded.length > 0 && 'text-primary hover:text-primary'
          )}
        >
          <SlidersHorizontal className="h-3 w-3" />
          Categories
          {excluded.length > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
              {excluded.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-medium mb-1">Exclude categories</h4>
            <p className="text-xs text-muted-foreground">
              Excluded categories are left out of every income and expense figure on the dashboard.
            </p>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-3">
            {PICKER_KINDS.map((kind) => {
              const group = categoriesOfKind(categories, kind)
              if (group.length === 0) return null
              return (
                <div key={kind} className="space-y-2">
                  <h5 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {CATEGORY_KIND_LABELS[kind]}
                  </h5>
                  {group.map((cat) => {
                    const isExcluded = excluded.includes(cat.code)
                    return (
                      <label
                        key={cat.code}
                        className="flex items-center gap-2 text-sm cursor-pointer hover:text-foreground"
                      >
                        <Checkbox checked={isExcluded} onCheckedChange={() => onToggle(cat.code)} />
                        <span className={cn(isExcluded && 'line-through text-muted-foreground')}>
                          {cat.label}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )
            })}
          </div>
          {excluded.length > 0 && (
            <Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={onClear}>
              Clear all
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
