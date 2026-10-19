import * as React from 'react'
import { cn } from '@/lib/utils'

interface MetaLabelProps extends React.ComponentProps<'span'> {
  /** Element to render, so the label keeps the right semantics (defaults to span) */
  as?: 'span' | 'p' | 'div' | 'label' | 'h2' | 'h3' | 'h4' | 'dt'
}

/** Small uppercase label used for section captions and field groups */
export function MetaLabel({ as: Tag = 'span', className, ...props }: MetaLabelProps) {
  return (
    <Tag
      data-slot="meta-label"
      className={cn(
        'text-xs font-medium uppercase tracking-wider text-muted-foreground',
        className
      )}
      {...(props as React.HTMLAttributes<HTMLElement>)}
    />
  )
}
