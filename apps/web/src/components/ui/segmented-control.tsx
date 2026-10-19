import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: React.ReactNode
  icon?: React.ReactNode
  /** Classes applied while this option is selected (for example a semantic color) */
  activeClassName?: string
}

export interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: SegmentedOption<T>[]
  /** Accessible name for the group */
  'aria-label': string
  size?: 'sm' | 'default'
  className?: string
}

/**
 * SegmentedControl - A row of mutually exclusive options where one is selected
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'default',
  className,
  ...props
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={props['aria-label']}
      data-slot="segmented-control"
      className={cn(
        'inline-flex w-fit items-center gap-0.5 rounded-xl border border-border-subtle bg-surface-elevated p-1',
        className
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              size === 'sm' ? 'h-6 px-2 text-xs' : 'px-3 py-1.5 text-sm',
              selected
                ? (option.activeClassName ?? 'bg-card text-foreground shadow-sm')
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
