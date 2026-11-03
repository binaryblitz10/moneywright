/**
 * AI learning section component
 * Shows what the app has learned from corrections, edits the AI's notes about the user
 * and lets the user make the app forget a merchant
 */

import { useState } from 'react'
import { SectionCard } from '@/components/ui/section-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ChevronDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  useAuth,
  useCategories,
  useForgetMerchant,
  useLearnedMerchants,
  useLearnedNotes,
  useLearningStats,
  useProfileSelection,
  useRefreshLearnedNotes,
  useResetLearnedNotes,
  useSaveLearnedNotes,
} from '@/hooks'
import type { LearnedMerchant, LearningStats } from '@/lib/api'

const MAX_NOTES_LENGTH = 2000

export function AiLearningSection() {
  const { activeProfileId } = useProfileSelection()
  const { defaultProfile } = useAuth()
  // Family view has no single profile, so fall back to the default one
  const profileId = activeProfileId ?? defaultProfile?.id

  return (
    <SectionCard
      title="AI learning"
      description="The app learns from your corrections and your past transactions. When it is sure about a merchant, the answer comes from memory without calling the AI."
      contentClassName="space-y-6"
    >
      <StatsRow profileId={profileId} />
      <NotesEditor profileId={profileId} />
      <ForgetMerchant />
    </SectionCard>
  )
}

function describeLastImport(lastImport: NonNullable<LearningStats['lastImport']>): string {
  const { rule, memory, ai } = lastImport.categorizedBy
  const parts = [
    memory > 0 && `${memory} from memory`,
    ai > 0 && `${ai} by AI`,
    rule > 0 && `${rule} by rules`,
  ].filter(Boolean)
  return `${lastImport.filename}: ${parts.length > 0 ? parts.join(' · ') : 'nothing categorized'}`
}

interface StatTileProps {
  label: string
  value: string
  loading: boolean
}

function StatTile({ label, value, loading }: StatTileProps) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-1 h-6 w-16" />
      ) : (
        <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      )}
    </div>
  )
}

function StatsRow({ profileId }: { profileId: string | undefined }) {
  const { data: stats, isLoading } = useLearningStats(profileId)
  const accuracy = stats?.accuracy.last30
  const loading = isLoading || !profileId

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="Merchants learned"
          value={String(stats?.merchantsLearned ?? 0)}
          loading={loading}
        />
        <StatTile
          label="AI accuracy (30 days)"
          value={accuracy == null ? 'Not enough data' : `${Math.round(accuracy * 100)}%`}
          loading={loading}
        />
        <StatTile
          label="Corrections this month"
          value={String(stats?.corrections30 ?? 0)}
          loading={loading}
        />
      </div>
      {stats?.lastImport && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Last import</span>{' '}
          {describeLastImport(stats.lastImport)}
        </p>
      )}
    </div>
  )
}

function NotesEditor({ profileId }: { profileId: string | undefined }) {
  const { data: notes, isLoading } = useLearnedNotes(profileId)

  if (isLoading || !profileId) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Notes about you</h3>
        <Skeleton className="h-[120px] w-full" />
      </div>
    )
  }

  // Keyed on the saved value so the draft resets whenever the saved notes change
  return <NotesCard key={notes ?? ''} profileId={profileId} saved={notes ?? ''} />
}

interface NotesCardProps {
  profileId: string
  saved: string
}

function NotesCard({ profileId, saved }: NotesCardProps) {
  const [value, setValue] = useState(saved)
  const [confirmReset, setConfirmReset] = useState(false)

  const saveMutation = useSaveLearnedNotes(profileId)
  const refreshMutation = useRefreshLearnedNotes(profileId)
  const resetMutation = useResetLearnedNotes(profileId)
  const busy = saveMutation.isPending || refreshMutation.isPending || resetMutation.isPending

  const trimmed = value.trim()

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Notes about you</h3>
      <Textarea
        placeholder="Nothing learned yet. Notes appear here after a few imports and corrections."
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, MAX_NOTES_LENGTH))}
        className="min-h-[120px] resize-none"
        maxLength={MAX_NOTES_LENGTH}
        disabled={refreshMutation.isPending}
      />
      <p className="text-xs text-muted-foreground">
        The AI writes these from your data and corrections and uses them when categorizing. Edit
        freely — your lines are kept.
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || !saved}
          onClick={() => setConfirmReset(true)}
        >
          Reset
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            refreshMutation.mutate(undefined, {
              onSuccess: () => toast.success('Notes refreshed'),
              onError: () => toast.error('Failed to refresh notes'),
            })
          }
        >
          {refreshMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {refreshMutation.isPending ? 'Refreshing (up to a minute)' : 'Refresh'}
        </Button>
        <Button
          size="sm"
          disabled={busy || trimmed === saved}
          onClick={() =>
            saveMutation.mutate(trimmed, {
              onSuccess: () => toast.success('Notes saved'),
              onError: () => toast.error('Failed to save notes'),
            })
          }
        >
          {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset the notes?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears everything written here, including your own lines. The AI starts fresh the
              next time it refreshes the notes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                resetMutation.mutate(undefined, {
                  onSuccess: () => toast.success('Notes reset'),
                  onError: () => toast.error('Failed to reset notes'),
                })
              }
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ForgetMerchant() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [forgetting, setForgetting] = useState<LearnedMerchant | null>(null)
  const { data: categoriesData } = useCategories()
  const categories = categoriesData?.categories ?? []
  const { data: merchants, isFetching } = useLearnedMerchants(query, open)
  const forgetMutation = useForgetMerchant()
  const hasQuery = query.trim().length > 0

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between text-left text-sm font-medium">
        Forget a merchant
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-3">
        <p className="text-xs text-muted-foreground">
          Search for a merchant the app has learned. Forgetting it makes the app work out its
          category from scratch the next time.
        </p>
        <Input
          placeholder="Search merchants"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {hasQuery && isFetching && !merchants ? (
          <Skeleton className="h-10 w-full" />
        ) : hasQuery && merchants?.length === 0 ? (
          <p className="text-sm text-muted-foreground">No learned merchants match that search.</p>
        ) : hasQuery ? (
          <ul className="divide-y rounded-lg border">
            {merchants?.map((m) => (
              <li key={m.fingerprint} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {categories.find((c) => c.code === m.category)?.label ?? m.category} ·{' '}
                    {m.rowCount} {m.rowCount === 1 ? 'transaction' : 'transactions'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={forgetMutation.isPending}
                  onClick={() => setForgetting(m)}
                >
                  Forget
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </CollapsibleContent>

      <AlertDialog open={!!forgetting} onOpenChange={(o) => !o && setForgetting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Forget {forgetting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Your past corrections for this merchant stop counting as certain. Transactions keep
              their current category.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!forgetting) return
                const { fingerprint, name } = forgetting
                forgetMutation.mutate(fingerprint, {
                  onSuccess: () => toast.success(`The app will re-learn ${name} from scratch`),
                  onError: () => toast.error(`Failed to forget ${name}`),
                })
                setForgetting(null)
              }}
            >
              Forget
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  )
}
