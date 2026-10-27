import { useState } from 'react'
import { ArrowLeft, ArrowRight, Calendar, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RangeCalendar } from '@/components/ui/range-calendar'
import { toLocalDateString } from '@/components/dashboard/utils'
import { useOptionNavigation } from '@/hooks/useOptionNavigation'
import {
  FINANCIAL_YEAR_PRESETS,
  LAST_PRESETS,
  PERIOD_TO_DATE_PRESETS,
  QUICK_PRESETS,
  findPresetId,
  formatLongDate,
  getPresetLabel,
  getPresetRange,
  getRangeLabel,
  parseLocalDate,
  type DatePresetId,
  type DateRangeValue,
} from '@/lib/date-presets'
import { cn } from '@/lib/utils'

export { getRangeLabel as getDateRangeLabel } from '@/lib/date-presets'

type Submenu = 'last' | 'period' | 'fy'

interface Draft extends DateRangeValue {
  /** The preset the dates came from; null for dates picked by hand */
  presetId: DatePresetId | null
}

/** Parse typed text such as "27 October 2026", "27 Oct 2026" or "2026-10-27" */
function parseDateInput(text: string): string | null {
  const value = text.trim()
  if (!value) return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const date = iso ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : toLocalDateString(date)
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
    const parsed = text === null ? null : parseDateInput(text)
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
      className="h-10 rounded-lg text-sm"
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
  const buttonLabel = label ?? getRangeLabel({ startDate, endDate }, country, currentPresetId)

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setDraft({ startDate, endDate, presetId: currentPresetId })
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

  const apply = () => {
    onChange(draft.startDate, draft.endDate, draft.presetId)
    setOpen(false)
  }

  // All time has no dates; any other range needs both
  const canApply = draft.presetId === 'all' || (!!draft.startDate && !!draft.endDate)
  const isCustom = draft.presetId === null
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
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size={variant === 'field' ? 'default' : 'sm'}
          className={cn(
            variant === 'field'
              ? cn(
                  'h-10 justify-between rounded-lg font-normal',
                  hasDateFilter && 'border-primary/30 bg-primary/5'
                )
              : 'h-9 text-sm',
            className
          )}
        >
          {variant === 'compact' && <Calendar className="mr-1.5 h-4 w-4" />}
          <span className={variant === 'field' ? 'truncate' : undefined}>{buttonLabel}</span>
          <ChevronDown
            className={cn(variant === 'field' ? 'ml-2 opacity-50' : 'ml-1', 'h-4 w-4 shrink-0')}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-auto max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl p-0"
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
              <Button
                variant="ghost"
                onClick={() => setOpen(false)}
                className="bg-muted-foreground/15 hover:bg-muted-foreground/25 active:scale-95"
              >
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
