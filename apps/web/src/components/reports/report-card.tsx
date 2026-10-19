/**
 * Building blocks shared by the report tabs: card with a scrolling table, loading and error states
 */

import type { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { SectionCard } from '@/components/ui/section-card'
import { Skeleton, StatCardGridSkeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface ReportCardProps {
  title: string
  description?: ReactNode
  /** Right of the title, e.g. a toggle */
  action?: ReactNode
  children: ReactNode
  className?: string
}

/** A card whose table scrolls sideways inside it on narrow screens, never the page */
export function ReportCard({ title, description, action, children, className }: ReportCardProps) {
  return (
    <SectionCard
      title={title}
      description={description}
      action={action}
      className={cn('gap-4 py-5', className)}
      contentClassName="px-2 sm:px-4"
    >
      {children}
    </SectionCard>
  )
}

/** Placeholder while a report loads */
export function ReportSkeleton() {
  return (
    <div className="space-y-6">
      <StatCardGridSkeleton count={5} />
      {[0, 1].map((i) => (
        <Card key={i} className="gap-4 py-5">
          <CardHeader className="px-4 sm:px-6">
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="space-y-3 px-4 sm:px-6">
            {Array.from({ length: 5 }).map((_, row) => (
              <Skeleton key={row} className="h-8 w-full" />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/** The API's own message for a rejected request, else the error's */
function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const data = (error as { response?: { data?: { message?: unknown } } }).response?.data
    if (typeof data?.message === 'string') return data.message
  }
  return error instanceof Error ? error.message : 'Something went wrong'
}

export function ReportError({ error }: { error: unknown }) {
  const message = errorMessage(error)
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>Could not load this report</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

/** Styles for table headers and number cells */
export const TH_CLASS = 'text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap'
export const NUM_CLASS = 'text-right tabular-nums whitespace-nowrap'
