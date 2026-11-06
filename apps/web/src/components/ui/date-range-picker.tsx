import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RangeCalendar } from '@/components/ui/range-calendar'
import { toLocalDateString } from '@/components/dashboard/utils'
import { useOptionNavigation } from '@/hooks/useOptionNavigation'
import { PICKER_COLORS_CLASS, PICKER_CONTENT_COLORS_CLASS } from '@/components/ui/picker-styles'
import {
  FINANCIAL_YEAR_PRESETS,
  LAST_PRESETS,
  PERIOD_TO_DATE_PRESETS,
  QUICK_PRESETS,
  findPresetId,
  formatLongDate,
  getMonthRange,
  getPresetLabel,
  getPresetRange,
  getRangeLabel,
  getWholeMonth,
  parseLocalDate,
  parseTypedDate,
  type DatePresetId,
  type DateRangeValue,
} from '@/lib/date-presets'
import { cn } from '@/lib/utils'

const SMALL_WORDS = new Set(['to', 'of', 'and'])

/** "Last quarter" -> "Last Quarter", keeping small words such as "to" lowercase */
function toTitleCase(text: string): string {
  return text.replace(/\b[a-z]+/g, (word, index: number) =>
    index > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)
  )
}

export { getRangeLabel as getDateRangeLabel } from '@/lib/date-presets'

type Submenu = 'last' | 'period' | 'fy'

interface Draft extends DateRangeValue {
  /** The preset the dates came from; null for dates picked by hand */
  presetId: DatePresetId | null
}

/** First month shown, so the range's end falls in the second month like Shopify's picker */
function viewFor(range: DateRangeValue): Date {
  const anchor = range.endDate ? parseLocalDate(range.endDate) : new Date()
  return new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1)
}

interface DateFieldProps {
  value?: string
  label: string
  onCommit: (value: string) => void
}

function DateField({ value, label, onCommit }: DateFieldProps) {
  const [text, setText] = useState<string | null>(null)

  const commit = () => {
    const parsed = text === null ? null : parseTypedDate(text)
    if (parsed) onCommit(parsed)
    setText(null)
  }

  return (
    <Input
      aria-label={label}
      value={text ?? (value ? formatLongDate(value) : '')}
      placeholder="DD Month YYYY"
      onFocus={(e) => {
        setText(value ? formatLongDate(value) : '')
        e.currentTarget.select()
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setText(null)
      }}
      className="h-10 select-text rounded-lg text-sm"
    />
  )
}

interface SidebarOptionProps {
  label: string
  selected: boolean
  onClick: () => void
}

function SidebarOption({ label, selected, onClick }: SidebarOptionProps) {
  return (
    <button
      type="button"
      data-option
      data-selected={selected || undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-center rounded-lg px-3 py-1.5 text-left text-sm outline-none',
        'transition-colors',
        selected
          ? 'bg-surface-hover font-semibold text-foreground'
          : 'text-foreground data-active:bg-surface-hover'
      )}
    >
      {label}
    </button>
  )
}

interface SidebarLinkProps {
  label: string
  onClick: () => void
}

/** A sidebar row that opens a submenu */
function SidebarLink({ label, onClick }: SidebarLinkProps) {
  return (
    <button
      type="button"
      data-option
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm outline-none transition-colors data-active:bg-surface-hover"
    >
      {label}
      <ChevronRight className="size-4 text-muted-foreground" />
    </button>
  )
}

export interface DateRangePickerProps {
  /** Both empty means all time */
  startDate?: string
  endDate?: string
  /** The preset the dates came from, when the caller keeps track (null = picked by hand) */
  presetId?: DatePresetId | null
  /** Receives the chosen dates and the preset they came from, if any */
  onChange: (startDate?: string, endDate?: string, presetId?: DatePresetId | null) => void
  country?: string | null
  /** Shown on the button instead of the range's name */
  label?: string
  /** Days outside these dates cannot be picked */
  minDate?: string
  maxDate?: string
  className?: string
  align?: 'start' | 'center' | 'end'
  /** 'compact' for page headers, 'field' for forms and filter bars */
  variant?: 'compact' | 'field'
}

export function DateRangePicker({
  startDate,
  endDate,
  presetId,
  onChange,
  country,
  label,
  minDate,
  maxDate,
  className,
  align = 'start',
  variant = 'compact',
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>({ startDate, endDate, presetId: null })
  const [month, setMonth] = useState(() => viewFor({ startDate, endDate }))
  // The first day clicked, while the end day is still to be picked
  // Which list the sidebar shows; a submenu takes the place of the main list
  const [submenu, setSubmenu] = useState<Submenu | null>(null)
  const [anchor, setAnchor] = useState<string>()
  const [preview, setPreview] = useState<string>()
  const navigation = useOptionNavigation(submenu)

  const currentPresetId =
    presetId === undefined ? findPresetId({ startDate, endDate }, country) : presetId
  const hasDateFilter = !!(startDate || endDate)

  // Month taken with the arrows. The page behind the picker can take a moment to catch up, so
  // the switcher goes by this until the dates it was given arrive; rapid clicks keep stepping
  const [stepped, setStepped] = useState<DateRangeValue | null>(null)
  useEffect(() => {
    if (!stepped) return
    // The page may not accept the month (out of range); stop waiting for it
    const giveUp = setTimeout(() => setStepped(null), 3000)
    return () => clearTimeout(giveUp)
  }, [stepped])
  const waiting = !!stepped && (stepped.startDate !== startDate || stepped.endDate !== endDate)
  const shown = waiting ? stepped : { startDate, endDate }
  const buttonLabel = waiting
    ? getRangeLabel(stepped, country, null)
    : (label ?? getRangeLabel({ startDate, endDate }, country, currentPresetId))

  // The compact picker is a month switcher: the arrows step by whole months from the month the
  // range ends in, and the middle opens the picker
  const switcher = variant === 'compact'
  const baseMonth = shown.endDate ? parseLocalDate(shown.endDate) : new Date()
  const prevMonthRange = getMonthRange(baseMonth, -1)
  const nextMonthRange = getMonthRange(baseMonth, 1)
  const canGoPrev = !minDate || prevMonthRange.endDate! >= minDate
  const canGoNext = nextMonthRange.startDate! <= (maxDate ?? toLocalDateString(new Date()))

  const stepTo = (range: DateRangeValue) => {
    setStepped(range)
    onChange(range.startDate, range.endDate, null)
  }

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setDraft({
        startDate,
        endDate,
        presetId: currentPresetId ?? (getWholeMonth({ startDate, endDate }) ? 'monthly' : null),
      })
      setMonth(viewFor({ startDate, endDate }))
      setAnchor(undefined)
      setPreview(undefined)
      setSubmenu(null)
    }
    setOpen(next)
  }

  const choosePreset = (id: DatePresetId) => {
    const range = getPresetRange(id, country)
    setDraft({ ...range, presetId: id })
    setMonth(viewFor(range))
    setAnchor(undefined)
  }

  const pickDay = (date: string) => {
    if (anchor) {
      const [from, to] = [anchor, date].sort()
      setDraft({ startDate: from, endDate: to, presetId: null })
      setAnchor(undefined)
    } else {
      setDraft({ startDate: date, endDate: date, presetId: null })
      setAnchor(date)
    }
  }

  const commitStart = (date: string) => {
    const end = draft.endDate && draft.endDate >= date ? draft.endDate : date
    setDraft({ startDate: date, endDate: end, presetId: null })
    setMonth(viewFor({ endDate: end }))
    setAnchor(undefined)
  }

  const commitEnd = (date: string) => {
    const start = draft.startDate && draft.startDate <= date ? draft.startDate : date
    setDraft({ startDate: start, endDate: date, presetId: null })
    setMonth(viewFor({ endDate: date }))
    setAnchor(undefined)
  }

  // Monthly is saved as the dates of the month, so the month picked stays picked
  const stepMonth = (delta: number) => {
    const current = getWholeMonth(draft) ?? new Date()
    const range = getMonthRange(current, delta)
    setDraft({ ...range, presetId: 'monthly' })
    setMonth(viewFor(range))
    setAnchor(undefined)
  }

  const apply = () => {
    setStepped(null)
    onChange(draft.startDate, draft.endDate, draft.presetId === 'monthly' ? null : draft.presetId)
    setOpen(false)
  }

  // All time has no dates; any other range needs both
  const canApply = draft.presetId === 'all' || (!!draft.startDate && !!draft.endDate)
  const isCustom = draft.presetId === null
  const monthly = draft.presetId === 'monthly' ? getWholeMonth(draft) : null
  const prevMonth = monthly ? getMonthRange(monthly, -1) : null
  const nextMonth = monthly ? getMonthRange(monthly, 1) : null
  const option = (id: DatePresetId, optionLabel: string) => (
    <SidebarOption
      key={id}
      label={optionLabel}
      selected={draft.presetId === id}
      onClick={() => choosePreset(id)}
    />
  )

  const submenus: Record<Submenu, { label: string; options: Array<[DatePresetId, string]> }> = {
    last: { label: 'Last', options: LAST_PRESETS.map((p) => [p.id, p.label]) },
    period: {
      label: 'Period to date',
      options: PERIOD_TO_DATE_PRESETS.map((p) => [p.id, p.label]),
    },
    fy: {
      label: 'Financial years',
      options: FINANCIAL_YEAR_PRESETS.map(({ id }) => [id, getPresetLabel(id, country)]),
    },
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      {switcher ? (
        <PopoverAnchor asChild>
          <div
            // Clicking the arrows quickly counts as a double click, which would select the text
            // around the picker. Pressing down here never starts a selection, and a selection
            // that still forms is cleared
            onMouseDown={(e) => e.preventDefault()}
            onDoubleClick={() => window.getSelection()?.removeAllRanges()}
            className={cn(
              'inline-flex items-center gap-1 rounded-xl border border-border-subtle bg-card p-1 select-none',
              className
            )}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Previous month"
              disabled={!canGoPrev}
              onClick={() => stepTo(prevMonthRange)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="h-8 min-w-40 px-3 text-sm font-medium">
                {toTitleCase(buttonLabel)}
              </Button>
            </PopoverTrigger>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Next month"
              disabled={!canGoNext}
              onClick={() => stepTo(nextMonthRange)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </PopoverAnchor>
      ) : (
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size={variant === 'field' ? 'default' : 'sm'}
            className={cn(
              'h-10 justify-between rounded-lg font-normal',
              PICKER_COLORS_CLASS,
              hasDateFilter && 'border-primary/30 bg-primary/5',
              className
            )}
          >
            <span className="truncate">{buttonLabel}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
      )}
      <PopoverContent
        align={align}
        collisionPadding={16}
        className={cn(
          PICKER_CONTENT_COLORS_CLASS,
          'w-auto max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl p-0 select-none'
        )}
        {...navigation}
      >
        <div className="flex flex-col md:flex-row">
          {/* Presets */}
          <div className="space-y-0.5 border-b border-border-subtle bg-surface-elevated/60 p-2 max-md:min-h-80 md:w-52 md:border-r md:border-b-0">
            {submenu ? (
              <>
                <button
                  type="button"
                  data-option
                  onClick={() => setSubmenu(null)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold outline-none transition-colors data-active:bg-surface-hover"
                >
                  <ArrowLeft className="size-4" />
                  {submenus[submenu].label}
                </button>
                <div className="mx-1 my-1.5 h-px bg-border-subtle" />
                {submenus[submenu].options.map(([id, label]) => option(id, label))}
              </>
            ) : (
              <>
                {QUICK_PRESETS.map((preset) => option(preset.id, preset.label))}

                <div className="mx-1 my-1.5 h-px bg-border-subtle" />

                <SidebarLink label="Last" onClick={() => setSubmenu('last')} />
                <SidebarLink label="Period to date" onClick={() => setSubmenu('period')} />
                <SidebarLink label="Financial years" onClick={() => setSubmenu('fy')} />

                <div className="mx-1 my-1.5 h-px bg-border-subtle" />

                <SidebarOption
                  label="Custom range"
                  selected={isCustom}
                  onClick={() => setDraft({ ...draft, presetId: null })}
                />
              </>
            )}
          </div>

          {/* Dates; keeps its own Enter and arrow keys */}
          <div data-own-keys className="flex flex-col">
            <div className="space-y-4 p-4">
              <div className="flex items-center gap-3">
                <DateField label="Start date" value={draft.startDate} onCommit={commitStart} />
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                <DateField label="End date" value={draft.endDate} onCommit={commitEnd} />
              </div>
              {monthly && prevMonth && nextMonth && (
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    aria-label="Previous month"
                    disabled={!!minDate && prevMonth.endDate! < minDate}
                    onClick={() => stepMonth(-1)}
                    className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="text-sm font-semibold">
                    {monthly.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </span>
                  <button
                    type="button"
                    aria-label="Next month"
                    disabled={!!maxDate && nextMonth.startDate! > maxDate}
                    onClick={() => stepMonth(1)}
                    className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              )}
              <RangeCalendar
                month={month}
                onMonthChange={setMonth}
                startDate={draft.startDate}
                endDate={draft.endDate}
                previewDate={anchor ? preview : undefined}
                onPreviewChange={setPreview}
                onSelect={pickDay}
                minDate={minDate}
                maxDate={maxDate}
              />
            </div>
            <div className="mt-auto flex justify-end gap-2 border-t border-border-subtle p-4">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!canApply}
                onClick={apply}
                className="hover:brightness-110 hover:shadow-md active:scale-95"
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
