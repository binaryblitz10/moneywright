import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  PICKER_CONTENT_CLASS,
  PICKER_LIST_CLASS,
  PICKER_SEARCH_CLASS,
  PICKER_TRIGGER_CLASS,
  ROW_ACTIVE_CLASS,
  ROW_CLASS,
} from '@/components/ui/picker-styles'
import { cn } from '@/lib/utils'

export interface SearchableSelectOption {
  value: string
  label: string
  /** Shown before the label, e.g. a logo */
  icon?: React.ReactNode
}

interface SearchableSelectProps {
  id?: string
  value: string
  onChange: (value: string) => void
  options: SearchableSelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyLabel?: string
  /** Adds a choice that clears the selection, passing an empty value to onChange */
  noneLabel?: string
  /** Shown on the trigger when the value is not among the options */
  fallbackLabel?: string
  /** Shown before the fallback label */
  fallbackIcon?: React.ReactNode
  /** Extra classes for the trigger button, e.g. to blend into a dialog form */
  triggerClassName?: string
}

/** Searchable single-choice dropdown that shares its look with the category picker */
export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyLabel = 'No results found',
  noneLabel,
  fallbackLabel,
  fallbackIcon,
  triggerClassName,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  // Option highlighted for the keyboard; null falls back to the default below
  const [activeValue, setActiveValue] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // Option last highlighted by the pointer, which must not scroll the list under the cursor
  const hoveredValueRef = useRef<string | null>(null)

  const selected = options.find((option) => option.value === value)
  const matching = options.filter((option) =>
    option.label.toLowerCase().includes(search.toLowerCase())
  )
  // Values in display order ('' is the none choice)
  const values = [...(noneLabel && !search ? [''] : []), ...matching.map((option) => option.value)]
  // Searching highlights the top match, otherwise the current value
  const active =
    activeValue !== null && values.includes(activeValue)
      ? activeValue
      : search
        ? values[0]
        : (values.find((v) => v === value && v !== '') ?? values[0])

  useEffect(() => {
    if (!open || active === undefined || active === hoveredValueRef.current) return
    listRef.current
      ?.querySelector(`[data-value="${CSS.escape(active)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const select = (next: string) => {
    onChange(next)
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (values.length === 0) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      const index = active === undefined ? -1 : values.indexOf(active)
      setActiveValue(values[(index + step + values.length) % values.length] ?? null)
    } else if (e.key === 'Enter') {
      // Keep Enter from submitting the surrounding form
      e.preventDefault()
      if (active !== undefined) select(active)
    }
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      hoveredValueRef.current = null
      setSearch('')
      setActiveValue(null)
    }
  }

  const triggerLabel = selected?.label ?? fallbackLabel
  const triggerIcon = selected ? selected.icon : fallbackLabel ? fallbackIcon : undefined

  return (
    <Popover modal open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(PICKER_TRIGGER_CLASS, triggerClassName)}
        >
          <span
            className={cn(
              'flex items-center gap-2 truncate',
              !triggerLabel && 'text-muted-foreground'
            )}
          >
            {triggerIcon}
            {triggerLabel ?? placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={PICKER_CONTENT_CLASS} align="start">
        <div className="relative border-b border-border-subtle">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setActiveValue(null)
            }}
            onKeyDown={handleKeyDown}
            className={PICKER_SEARCH_CLASS}
          />
        </div>
        <div ref={listRef} className={PICKER_LIST_CLASS}>
          {noneLabel && !search && (
            <button
              type="button"
              data-value=""
              className={cn(ROW_CLASS, active === '' && ROW_ACTIVE_CLASS)}
              onMouseMove={() => {
                hoveredValueRef.current = ''
                setActiveValue('')
              }}
              onClick={() => select('')}
            >
              <span className="h-2 w-2 shrink-0 rounded-full border border-muted-foreground/50" />
              <span className="flex-1 truncate">{noneLabel}</span>
              {!value && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          )}
          {matching.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
          ) : (
            matching.map((option) => (
              <button
                key={option.value}
                type="button"
                data-value={option.value}
                className={cn(ROW_CLASS, option.value === active && ROW_ACTIVE_CLASS)}
                onMouseMove={() => {
                  hoveredValueRef.current = option.value
                  setActiveValue(option.value)
                }}
                onClick={() => select(option.value)}
              >
                {option.icon}
                <span className="flex-1 truncate">{option.label}</span>
                {option.value === value && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
