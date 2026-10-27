import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Category, CategoryKind } from '@/lib/api'
import { CATEGORY_KIND_LABELS, CATEGORY_KIND_ORDER, categoriesOfKind } from '@/lib/category-kinds'
import { cn } from '@/lib/utils'

interface CategoryPickerBaseProps {
  id?: string
  categories: Category[]
  placeholder?: string
  /** Extra classes for the dropdown, e.g. a fixed width when the trigger is narrow */
  contentClassName?: string
  /** Which edge of the trigger the dropdown lines up with (default: start) */
  contentAlign?: 'start' | 'end'
  /** Extra classes for the trigger button */
  triggerClassName?: string
}

interface SingleCategoryPickerProps extends CategoryPickerBaseProps {
  multiple?: false
  value: string
  onChange: (code: string) => void
  /** Adds a choice that clears the selection, passing an empty code to onChange */
  noneLabel?: string
  /** Replaces the default button, e.g. a pill inside a table row */
  trigger?: React.ReactNode
}

interface MultiCategoryPickerProps extends CategoryPickerBaseProps {
  multiple: true
  values: string[]
  onValuesChange: (codes: string[]) => void
  /** Replaces the default trigger text, e.g. "3 selected" */
  triggerLabel?: string
  /** Icon shown before the trigger text */
  triggerIcon?: React.ReactNode
  /** Rows above the list when not searching, e.g. "All categories". Receives the popover closer */
  leadingRows?: React.ReactNode
  /** Greys out the kind chips and category rows */
  disabled?: boolean
}

type CategoryPickerProps = SingleCategoryPickerProps | MultiCategoryPickerProps

/** Searchable category list, grouped by kind. Single-select by default, or multi-select with `multiple` */
export function CategoryPicker(props: CategoryPickerProps) {
  const {
    id,
    categories,
    placeholder = 'Select a category',
    contentClassName,
    contentAlign = 'start',
  } = props
  const selected = props.multiple ? props.values : props.value ? [props.value] : []
  const noneLabel = props.multiple ? undefined : props.noneLabel
  const disabled = props.multiple ? props.disabled : false
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<CategoryKind | null>(null)
  // Option highlighted for the keyboard; null falls back to the default below
  const [activeCode, setActiveCode] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // Option last highlighted by the pointer, which must not scroll the list under the cursor
  const hoveredCodeRef = useRef<string | null>(null)

  const matching = categories.filter((cat) =>
    cat.label.toLowerCase().includes(search.toLowerCase())
  )
  const groups = CATEGORY_KIND_ORDER.filter((kind) => !kindFilter || kind === kindFilter)
    .map((kind) => ({ kind, items: categoriesOfKind(matching, kind) }))
    .filter((group) => group.items.length > 0)

  // Options in display order ('' is the none choice)
  const options = [
    ...(noneLabel ? [''] : []),
    ...groups.flatMap((group) => group.items.map((cat) => cat.code)),
  ]
  // Searching highlights the top match, otherwise the current value
  const active =
    activeCode !== null && options.includes(activeCode)
      ? activeCode
      : search
        ? (options.find((code) => code !== '') ?? options[0])
        : (options.find((code) => selected.includes(code)) ?? options[0])

  useEffect(() => {
    if (!open || active === undefined || active === hoveredCodeRef.current) return
    listRef.current
      ?.querySelector(`[data-code="${CSS.escape(active)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (options.length === 0) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      const index = active === undefined ? -1 : options.indexOf(active)
      setActiveCode(options[(index + step + options.length) % options.length] ?? null)
    } else if (e.key === 'Enter') {
      // Keep Enter from submitting the surrounding form
      e.preventDefault()
      if (active !== undefined) select(active)
    }
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      hoveredCodeRef.current = null
      setSearch('')
      setKindFilter(null)
      setActiveCode(null)
    }
  }

  const select = (code: string) => {
    if (props.multiple) {
      props.onValuesChange(
        selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]
      )
      return
    }
    props.onChange(code)
    setOpen(false)
  }

  // Multi-select: select or clear every category of one kind
  const toggleKind = (kind: CategoryKind) => {
    if (!props.multiple) return
    const codes = categoriesOfKind(categories, kind).map((cat) => cat.code)
    const allSelected = codes.every((code) => selected.includes(code))
    props.onValuesChange(
      allSelected
        ? selected.filter((code) => !codes.includes(code))
        : [...selected, ...codes.filter((code) => !selected.includes(code))]
    )
  }

  const triggerText = props.multiple
    ? (props.triggerLabel ??
      (selected.length === 1
        ? categories.find((cat) => cat.code === selected[0])?.label
        : selected.length
          ? `${selected.length} selected`
          : undefined))
    : categories.find((cat) => cat.code === props.value)?.label

  return (
    <Popover modal open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {!props.multiple && props.trigger ? (
          props.trigger
        ) : (
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn(
              'h-10 w-full justify-between rounded-lg font-normal bg-surface-elevated border-border-subtle hover:bg-surface-hover hover:border-border-hover',
              props.triggerClassName
            )}
          >
            <span
              className={cn(
                'flex items-center gap-2 truncate',
                !triggerText && 'text-muted-foreground'
              )}
            >
              {props.multiple && props.triggerIcon}
              {triggerText ?? placeholder}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className={cn('w-(--radix-popover-trigger-width) min-w-72 p-2', contentClassName)}
        align={contentAlign}
      >
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search categories..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setActiveCode(null)
            }}
            onKeyDown={handleKeyDown}
            className="h-8 pl-8 text-sm bg-surface-elevated border-border-subtle"
          />
        </div>
        {/* Kind chips: single-select shows one kind, multi-select selects or clears a kind */}
        <div className="mb-2 flex flex-wrap justify-center gap-1.5 px-0.5 py-2.5">
          {CATEGORY_KIND_ORDER.map((kind) => {
            const kindCodes = categoriesOfKind(categories, kind).map((cat) => cat.code)
            const isActive = props.multiple
              ? kindCodes.length > 0 && kindCodes.every((code) => selected.includes(code))
              : kindFilter === kind
            return (
              <button
                key={kind}
                type="button"
                disabled={disabled || (props.multiple && kindCodes.length === 0)}
                aria-pressed={isActive}
                onClick={() => {
                  if (props.multiple) return toggleKind(kind)
                  setKindFilter(isActive ? null : kind)
                  setActiveCode(null)
                }}
                className={cn(
                  'whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                  'disabled:pointer-events-none disabled:opacity-50',
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
        <div ref={listRef} className="max-h-60 space-y-1 overflow-y-auto">
          {props.multiple && !search && props.leadingRows && (
            <>
              {props.leadingRows}
              <div className="my-2 border-t border-border-subtle" />
            </>
          )}
          {noneLabel && (
            <Button
              type="button"
              variant={active === '' ? 'secondary' : 'ghost'}
              size="sm"
              data-code=""
              className="w-full justify-start gap-2 px-2"
              onMouseMove={() => setActiveCode('')}
              onClick={() => select('')}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {selected.length === 0 && <Check className="h-4 w-4 text-primary" />}
              </span>
              <span className="truncate">{noneLabel}</span>
            </Button>
          )}
          {groups.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No categories found</p>
          ) : (
            groups.map(({ kind, items }) => (
              <div key={kind} className="space-y-1">
                <p className="px-2 pt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {CATEGORY_KIND_LABELS[kind]}
                </p>
                {items.map((cat) => {
                  const isSelected = selected.includes(cat.code)
                  return (
                    <Button
                      key={cat.code}
                      type="button"
                      variant={
                        cat.code === active || (props.multiple && isSelected)
                          ? 'secondary'
                          : 'ghost'
                      }
                      size="sm"
                      disabled={disabled}
                      data-code={cat.code}
                      className="w-full justify-start gap-2 px-2"
                      onMouseMove={() => {
                        hoveredCodeRef.current = cat.code
                        setActiveCode(cat.code)
                      }}
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
