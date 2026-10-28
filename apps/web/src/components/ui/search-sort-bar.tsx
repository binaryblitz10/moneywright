import { ArrowUpDown, Check, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useOptionNavigation } from '@/hooks/useOptionNavigation'
import { cn } from '@/lib/utils'

export interface SortChoice<T extends string> {
  value: T
  label: string
}

interface SearchSortBarProps<T extends string> {
  search: string
  onSearchChange: (search: string) => void
  searchPlaceholder: string
  sort: T
  sortOptions: SortChoice<T>[]
  onSortChange: (sort: T) => void
  className?: string
}

/** Search box plus sort popover for lists, styled like the subscriptions and statements pages */
export function SearchSortBar<T extends string>({
  search,
  onSearchChange,
  searchPlaceholder,
  sort,
  sortOptions,
  onSortChange,
  className,
}: SearchSortBarProps<T>) {
  const navigation = useOptionNavigation()

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 p-4 rounded-2xl',
        'bg-linear-to-b from-card to-card/80',
        'border border-border-subtle',
        'shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]',
        'dark:shadow-[0_1px_3px_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.15)]',
        className
      )}
    >
      <div className="relative min-w-60 flex-1">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          data-page-search
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className={cn(
            'h-11 rounded-xl border border-border-subtle pl-10 pr-10',
            'bg-surface-elevated',
            'placeholder:text-muted-foreground/60',
            'focus-visible:ring-2 focus-visible:ring-primary/20'
          )}
        />
        {search && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-11 rounded-xl">
            <ArrowUpDown className="mr-2 h-4 w-4" />
            {sortOptions.find((o) => o.value === sort)?.label || 'Sort'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-60 p-1.5" align="end" {...navigation}>
          <div className="space-y-1">
            {sortOptions.map((option) => (
              <Button
                key={option.value}
                variant={sort === option.value ? 'secondary' : 'ghost'}
                size="sm"
                data-option
                data-selected={sort === option.value || undefined}
                className="w-full justify-start gap-2 px-2 data-active:bg-accent"
                onClick={() => onSortChange(option.value)}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {sort === option.value && <Check className="h-4 w-4" />}
                </span>
                <span className="whitespace-nowrap">{option.label}</span>
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
