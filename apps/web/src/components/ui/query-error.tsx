import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface QueryErrorProps {
  /** Main title */
  title?: string
  /** The error thrown by the query, used for the description */
  error?: unknown
  /** Retry handler, usually the query's refetch */
  onRetry?: () => void
  /** Size variant */
  size?: 'sm' | 'default'
  /** Additional class name */
  className?: string
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong while loading this data.'
}

/**
 * Shared error state for failed queries, styled to match EmptyState
 */
export function QueryError({
  title = "Couldn't load data",
  error,
  onRetry,
  size = 'default',
  className,
}: QueryErrorProps) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-xl text-center bg-card border border-dashed border-border-subtle',
        size === 'sm' ? 'py-8' : 'py-12',
        className
      )}
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-border-subtle bg-surface-elevated">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm px-4 text-sm text-muted-foreground">
        {errorMessage(error)}
      </p>
      {onRetry && (
        <div className="mt-6 flex justify-center">
          <Button variant="outline" onClick={onRetry}>
            <RotateCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        </div>
      )}
    </div>
  )
}
