import { useState } from 'react'
import { ChevronDown, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { describeUndo, useAutoFixBatches, useUndoBatch, useUndoChange } from '@/hooks'
import type { AutoFixBatch } from '@/lib/api'

interface AutoFixedPanelProps {
  /** Undefined in family view */
  profileId: string | undefined
}

/** "duplicates-sure" -> "Duplicates sure" when the API gives no label */
function fixerName(fixer: string): string {
  const text = fixer.replace(/[-_]/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${day}, ${time}`
}

function BatchCard({ batch }: { batch: AutoFixBatch }) {
  const [open, setOpen] = useState(false)
  const undoBatch = useUndoBatch()
  const undoChange = useUndoChange()
  const count = batch.changes.length
  const origin = batch.trigger === 'import' ? 'After import' : 'Fixed by you'

  const onResult = (result: { undone: number; skipped: number }) =>
    toast.success(describeUndo(result))
  const onError = () => toast.error('Could not undo')

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        'rounded-xl border border-border-subtle bg-card p-4',
        batch.undoneAt && 'opacity-70'
      )}
    >
      <div className="flex items-center gap-3">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180'
            )}
          />
          <span className="truncate text-sm font-medium">
            {origin} · {formatWhen(batch.createdAt)} · {count} {count === 1 ? 'fix' : 'fixes'}
          </span>
        </CollapsibleTrigger>
        {batch.undoneAt ? (
          <Badge variant="secondary">Undone</Badge>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={undoBatch.isPending}
            onClick={() => undoBatch.mutate(batch.id, { onSuccess: onResult, onError })}
          >
            <Undo2 className="mr-1.5 h-3.5 w-3.5" />
            Undo all
          </Button>
        )}
      </div>
      <CollapsibleContent className="mt-3">
        <ul className="divide-y divide-border-subtle">
          {batch.changes.map((change) => (
            <li key={change.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm">{change.description}</p>
                <p className="text-xs text-muted-foreground">{fixerName(change.fixer)}</p>
              </div>
              {change.undoneAt ? (
                <span className="text-xs text-muted-foreground">Undone</span>
              ) : (
                !batch.undoneAt && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={undoChange.isPending}
                    onClick={() => undoChange.mutate(change.id, { onSuccess: onResult, onError })}
                  >
                    Undo
                  </Button>
                )
              )}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Everything the app fixed (after imports or on request), each batch undoable */
export function AutoFixedPanel({ profileId }: AutoFixedPanelProps) {
  const { data: batches, isLoading } = useAutoFixBatches(profileId)

  if (isLoading) return <Skeleton className="h-24 w-full" />
  if (!batches || batches.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Nothing has been fixed automatically yet
      </p>
    )
  }
  return (
    <div className="space-y-3">
      {batches.map((batch) => (
        <BatchCard key={batch.id} batch={batch} />
      ))}
    </div>
  )
}
