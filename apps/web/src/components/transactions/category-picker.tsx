import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Category, CategoryKind } from '@/lib/api'
import { CATEGORY_KIND_LABELS, CATEGORY_KIND_ORDER, categoriesOfKind } from '@/lib/category-kinds'
import { cn } from '@/lib/utils'

export const ROW_CLASS =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground/85 transition-colors disabled:pointer-events-none disabled:opacity-50'
export const ROW_ACTIVE_CLASS = 'bg-foreground/[0.08] text-foreground'
/** For rows outside the keyboard-highlighted list, which have no highlight of their own */
export const ROW_HOVER_CLASS = 'hover:bg-foreground/[0.08] hover:text-foreground'

// Full class names so Tailwind can see them
const DOT_COLORS: Record<string, string> = {
  emerald: 'bg-emerald-500',
  orange: 'bg-orange-500',
  lime: 'bg-lime-500',
  blue: 'bg-blue-500',
  cyan: 'bg-cyan-500',
  purple: 'bg-purple-500',
  amber: 'bg-amber-500',
  pink: 'bg-pink-500',
  sky: 'bg-sky-500',
  red: 'bg-red-500',
  fuchsia: 'bg-fuchsia-500',
  indigo: 'bg-indigo-500',
  slate: 'bg-slate-500',
  violet: 'bg-violet-500',
  teal: 'bg-teal-500',
  rose: 'bg-rose-500',
  zinc: 'bg-zinc-500',
}

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
        className={cn(
          'w-(--radix-popover-trigger-width) min-w-72 overflow-hidden rounded-xl border-border-hover bg-popover p-0 dark:bg-background shadow-2xl shadow-black/15 dark:shadow-black/60',
          contentClassName
        )}
        align={contentAlign}
      >
        <div className="relative border-b border-border-subtle">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search categories..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setActiveCode(null)
            }}
            onKeyDown={handleKeyDown}
            className="h-11 rounded-none border-0 bg-transparent pl-10 text-sm shadow-none focus-visible:ring-0"
          />
        </div>
        {/* Kind chips: single-select shows one kind, multi-select selects or clears a kind */}
        <div className="flex flex-wrap gap-1.5 border-b border-border-subtle px-3 py-2.5">
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
                  'cursor-pointer whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  'disabled:pointer-events-none disabled:opacity-50',
                  isActive
                    ? 'border-primary/40 bg-primary/15 text-primary'
                    : 'border-border-subtle text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground'
                )}
              >
                {CATEGORY_KIND_LABELS[kind]}
              </button>
            )
          })}
        </div>
        <div
          ref={listRef}
          className="max-h-72 space-y-0.5 overflow-y-auto p-1.5 [scrollbar-width:thin]"
        >
          {props.multiple && !search && props.leadingRows && (
            <>
              {props.leadingRows}
              <div className="my-2 border-t border-border-subtle" />
            </>
          )}
          {noneLabel && (
            <button
              type="button"
              data-code=""
              className={cn(ROW_CLASS, active === '' && ROW_ACTIVE_CLASS)}
              onMouseMove={() => setActiveCode('')}
              onClick={() => select('')}
            >
              <span className="h-2 w-2 shrink-0 rounded-full border border-muted-foreground/50" />
              <span className="flex-1 truncate">{noneLabel}</span>
              {selected.length === 0 && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          )}
          {groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No categories found</p>
          ) : (
            groups.map(({ kind, items }) => (
              <div key={kind} className="space-y-0.5">
                <p className="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                  {CATEGORY_KIND_LABELS[kind]}
                </p>
                {items.map((cat) => {
                  const isSelected = selected.includes(cat.code)
                  return (
                    <button
                      key={cat.code}
                      type="button"
                      disabled={disabled}
                      data-code={cat.code}
                      className={cn(
                        ROW_CLASS,
                        (cat.code === active || (props.multiple && isSelected)) && ROW_ACTIVE_CLASS
                      )}
                      onMouseMove={() => {
                        hoveredCodeRef.current = cat.code
                        setActiveCode(cat.code)
                      }}
                      onClick={() => select(cat.code)}
                    >
                      <span
                        className={cn(
                          'h-2 w-2 shrink-0 rounded-full',
                          DOT_COLORS[cat.color] ?? 'bg-zinc-500'
                        )}
                      />
                      <span className="flex-1 truncate">{cat.label}</span>
                      {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
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
