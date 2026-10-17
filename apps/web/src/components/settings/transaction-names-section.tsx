/**
 * Transaction names section: rename older transactions to the clean name format
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Loader2 } from 'lucide-react'
import { useRenameTransactionNames } from '@/hooks'
import { getPreferences, PREFERENCE_KEYS } from '@/lib/api'

export function TransactionNamesSection() {
  const [includeEdited, setIncludeEdited] = useState(false)
  const { start, startError, job, isRunning } = useRenameTransactionNames()

  const { data: preferences } = useQuery({
    queryKey: ['preferences'],
    queryFn: () => getPreferences(),
  })

  const handleStart = () => {
    // Use the model chosen for statement categorization, if one was saved
    const provider = preferences?.[PREFERENCE_KEYS.STATEMENT_CATEGORISATION_PROVIDER]
    const model = preferences?.[PREFERENCE_KEYS.STATEMENT_CATEGORISATION_MODEL]
    start({ includeEdited, model: provider && model ? `${provider}:${model}` : undefined })
  }

  const percent =
    job && job.totalCount > 0 ? Math.round((job.renamedCount / job.totalCount) * 100) : 0
  const isDone = job?.status === 'completed'
  const isFailed = job?.status === 'failed' || !!startError

  return (
    <Card className="border-border-subtle hover:border-border-hover transition-colors animate-fade-in">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Transaction names
        </CardTitle>
        <CardDescription className="text-xs">
          Renames older transactions to the new clean format, using just the name of the other
          party. Only the name changes; categories are never touched. This uses your AI provider and
          may take a few minutes.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="rename-include-edited"
            checked={includeEdited}
            onCheckedChange={(checked) => setIncludeEdited(checked === true)}
            disabled={isRunning}
          />
          <Label htmlFor="rename-include-edited" className="text-sm font-normal cursor-pointer">
            Also rename transactions I&apos;ve edited
          </Label>
        </div>

        {isRunning && job && job.totalCount > 0 && (
          <div className="space-y-1.5">
            <Progress value={percent} />
            <p className="text-xs text-muted-foreground">
              Renamed {job.renamedCount} of {job.totalCount}
            </p>
          </div>
        )}

        {isDone && job && (
          <p className="text-sm text-muted-foreground">
            Renamed {job.renamedCount} transaction{job.renamedCount === 1 ? '' : 's'}, skipped{' '}
            {job.skippedCount}
            {job.failedCount > 0 && `, ${job.failedCount} could not be renamed (run it again)`}.
          </p>
        )}

        {isFailed && (
          <p className="text-sm text-destructive">
            {job?.errorMessage || 'Could not start the rename. Check your AI provider settings.'}
          </p>
        )}

        <div className="flex justify-end">
          <Button size="sm" disabled={isRunning} onClick={handleStart}>
            {isRunning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update transaction names
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
