import * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface SectionCardProps extends Omit<React.ComponentProps<typeof Card>, 'title'> {
  /** Card title, shown as a small uppercase caption */
  title: React.ReactNode
  /** Optional text directly under the title */
  description?: React.ReactNode
  /** Optional controls aligned to the right of the title (buttons, counts, toggles) */
  action?: React.ReactNode
  /** Extra classes for the content area */
  contentClassName?: string
}

/**
 * SectionCard - Card with a consistent title, optional description and optional action
 */
export function SectionCard({
  title,
  description,
  action,
  className,
  contentClassName,
  children,
  ...props
}: SectionCardProps) {
  return (
    <Card
      className={cn(
        'border-border-subtle hover:border-border-hover transition-colors animate-fade-in',
        className
      )}
      {...props}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              {title}
            </CardTitle>
            {description && <CardDescription className="text-xs">{description}</CardDescription>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
        </div>
      </CardHeader>
      <CardContent className={cn('pt-0', contentClassName)}>{children}</CardContent>
    </Card>
  )
}
