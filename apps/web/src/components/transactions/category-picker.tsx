import { useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Category, CategoryKind } from '@/lib/api'
import { CATEGORY_KIND_LABELS, CATEGORY_KIND_ORDER, categoriesOfKind } from '@/lib/category-kinds'
import { cn } from '@/lib/utils'

interface CategoryPickerProps {
  id?: string
  categories: Category[]
  value: string
  onChange: (code: string) => void
}

/** Searchable single-select category list, grouped by kind like the transactions filter */
export function CategoryPicker({ id, categories, value, onChange }: CategoryPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<CategoryKind | null>(null)

  const matching = categories.filter((cat) =>
    cat.label.toLowerCase().includes(search.toLowerCase())
  )
  const groups = CATEGORY_KIND_ORDER.filter((kind) => !kindFilter || kind === kindFilter)
    .map((kind) => ({ kind, items: categoriesOfKind(matching, kind) }))
    .filter((group) => group.items.length > 0)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setSearch('')
      setKindFilter(null)
    }
  }

  const select = (code: string) => {
    onChange(code)
    setOpen(false)
  }

  return (
    <Popover modal open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className="h-10 w-full justify-between rounded-lg font-normal bg-surface-elevated border-border-subtle hover:bg-surface-hover hover:border-border-hover"
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>
            {categories.find((cat) => cat.code === value)?.label ?? 'Select a category'}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-2" align="start">
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search categories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-sm bg-surface-elevated border-border-subtle"
          />
        </div>
        {/* Kind chips: show only the categories of one kind */}
        <div className="mb-2 flex flex-wrap justify-center gap-1.5 px-0.5 py-2.5">
          {CATEGORY_KIND_ORDER.map((kind) => {
            const isActive = kindFilter === kind
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={isActive}
                onClick={() => setKindFilter(isActive ? null : kind)}
                className={cn(
                  'whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                  isActive
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border-subtle bg-surface-elevated text-muted-foreground hover:text-foreground'
                )}
              >
                {CATEGORY_KIND_LABELS[kind]}
              </button>
            )
          })}
        </div>
        <div className="max-h-60 space-y-1 overflow-y-auto">
          {groups.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No categories found</p>
          ) : (
            groups.map(({ kind, items }) => (
              <div key={kind} className="space-y-1">
                <p className="px-2 pt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {CATEGORY_KIND_LABELS[kind]}
                </p>
                {items.map((cat) => {
                  const isSelected = cat.code === value
                  return (
                    <Button
                      key={cat.code}
                      type="button"
                      variant={isSelected ? 'secondary' : 'ghost'}
                      size="sm"
                      className="w-full justify-start gap-2 px-2"
                      onClick={() => select(cat.code)}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                        {isSelected && <Check className="h-4 w-4 text-primary" />}
                      </span>
                      <span className="truncate">{cat.label}</span>
                    </Button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
