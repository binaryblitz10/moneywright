import * as React from 'react'
import { cn } from '@/lib/utils'

/** Centers chat content in a readable column on large screens */
export function ChatColumn({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('w-full lg:w-3xl lg:mx-auto', className)} {...props} />
}
