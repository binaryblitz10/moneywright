import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Base styles (same look as Input)
        'flex field-sizing-content min-h-16 w-full min-w-0 rounded-md px-3 py-2 text-sm',
        'bg-background border border-input',
        'placeholder:text-muted-foreground/60',
        'transition-all duration-200 outline-none',
        'focus-visible:ring-2 focus-visible:ring-primary/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:ring-2',
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
