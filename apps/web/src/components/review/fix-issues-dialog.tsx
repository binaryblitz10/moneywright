import { useMemo, useState } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { describeUndo, useApplyFixes, useAutoFixPreview, useUndoBatch } from '@/hooks'
import type { AutoFixerPreview } from '@/lib/api'

interface FixIssuesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Undefined in family view */
  profileId: string | undefined
}

interface FixerRowProps {
  fixer: AutoFixerPreview
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

function FixerRow({ fixer, checked, onCheckedChange }: FixerRowProps) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="py-3">
      <div className="flex items-center gap-3">
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          aria-label={fixer.label}
        />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-medium">{fixer.label}</span>
          {fixer.usesAi && (
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="h-3 w-3" />
              Uses AI
            </Badge>
          )}
        </div>
        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          {fixer.count}
        </span>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Show details">
            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="mt-2 ml-7">
        <ul className="max-h-48 space-y-1.5 overflow-y-auto text-xs text-muted-foreground">
          {fixer.items.map((item) => (
            <li key={item.id}>{item.description}</li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Body is mounted only while open, so choices and the preview start fresh each time */
function FixIssuesBody({ onOpenChange, profileId }: Omit<FixIssuesDialogProps, 'open'>) {
  const { data: fixers, isLoading } = useAutoFixPreview(profileId)
  const applyFixes = useApplyFixes()
  const undoBatch = useUndoBatch()
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set())
  const [aiChecked, setAiChecked] = useState<Set<string>>(new Set())

  const rows = useMemo(() => (fixers ?? []).filter((f) => f.count > 0), [fixers])
  const isChecked = (f: AutoFixerPreview) =>
    f.usesAi ? aiChecked.has(f.fixer) : !unchecked.has(f.fixer)
  const selected = rows.filter(isChecked)
  const total = selected.reduce((sum, f) => sum + f.count, 0)

  const toggle = (f: AutoFixerPreview, checked: boolean) => {
    const setter = f.usesAi ? setAiChecked : setUnchecked
    setter((prev) => {
      const next = new Set(prev)
      // AI fixers are opt-in (set holds ticked); the rest are opt-out (set holds unticked)
      if (checked === f.usesAi) next.add(f.fixer)
      else next.delete(f.fixer)
      return next
    })
  }

  const handleApply = async () => {
    try {
      const result = await applyFixes.mutateAsync({
        profileId,
        fixerIds: selected.map((f) => f.fixer),
      })
      onOpenChange(false)
      if (!result.batchId) {
        toast.info('Nothing changed')
        return
      }
      const batchId = result.batchId
      toast.success(`Fixed ${result.count} ${result.count === 1 ? 'issue' : 'issues'}`, {
        action: {
          label: 'Undo',
          onClick: () =>
            undoBatch.mutate(batchId, {
              onSuccess: (undo) => toast.success(describeUndo(undo)),
              onError: () => toast.error('Could not undo the fixes'),
            }),
        },
      })
    } catch {
      toast.error('Could not apply the fixes')
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Fix issues</DialogTitle>
        <DialogDescription>
          Review what will change. Every fix can be undone from the Auto-fixed tab.
        </DialogDescription>
      </DialogHeader>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nothing to fix right now</p>
      ) : (
        <div className="max-h-[50vh] divide-y divide-border-subtle overflow-y-auto">
          {rows.map((f) => (
            <FixerRow
              key={f.fixer}
              fixer={f}
              checked={isChecked(f)}
              onCheckedChange={(checked) => toggle(f, checked)}
            />
          ))}
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={handleApply} disabled={total === 0 || applyFixes.isPending}>
          {applyFixes.isPending ? 'Applying…' : `Apply ${total} ${total === 1 ? 'fix' : 'fixes'}`}
        </Button>
      </DialogFooter>
    </>
  )
}

/** Previews everything the app can fix, then applies the ticked fixers with an Undo toast */
export function FixIssuesDialog({ open, onOpenChange, profileId }: FixIssuesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <FixIssuesBody onOpenChange={onOpenChange} profileId={profileId} />
      </DialogContent>
    </Dialog>
  )
}
