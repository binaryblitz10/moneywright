/**
 * Default categorization hints section component
 * Prefilled on statement upload for accounts that have no hints of their own
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getPreferences, setPreference, deletePreference, PREFERENCE_KEYS } from '@/lib/api'

const MAX_HINTS_LENGTH = 1000

export function CategorizationHintsSection() {
  const queryClient = useQueryClient()
  const { data: preferences, isLoading } = useQuery({
    queryKey: ['preferences'],
    queryFn: () => getPreferences(),
  })

  if (isLoading) return null

  const saved = preferences?.[PREFERENCE_KEYS.DEFAULT_CATEGORIZATION_HINTS] ?? ''

  // Keyed on the saved value so the draft resets whenever the saved hints change
  return (
    <HintsCard
      key={saved}
      saved={saved}
      onSaved={() => queryClient.invalidateQueries({ queryKey: ['preferences'] })}
    />
  )
}

interface HintsCardProps {
  saved: string
  onSaved: () => void
}

function HintsCard({ saved, onSaved }: HintsCardProps) {
  const [value, setValue] = useState(saved)

  const saveMutation = useMutation({
    mutationFn: async (hints: string) => {
      if (hints) {
        await setPreference(PREFERENCE_KEYS.DEFAULT_CATEGORIZATION_HINTS, hints)
      } else {
        await deletePreference(PREFERENCE_KEYS.DEFAULT_CATEGORIZATION_HINTS)
      }
    },
    onSuccess: () => {
      onSaved()
      toast.success('Default categorization hints saved')
    },
    onError: () => toast.error('Failed to save default categorization hints'),
  })

  const trimmed = value.trim()

  return (
    <Card className="border-border-subtle hover:border-border-hover transition-colors animate-fade-in">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Categorization Hints
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <Textarea
          placeholder="E.g., FX transactions are investments, not transfers"
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, MAX_HINTS_LENGTH))}
          className="min-h-[100px] resize-none"
          maxLength={MAX_HINTS_LENGTH}
        />
        <p className="text-xs text-muted-foreground">
          Prefilled when you upload a statement. Accounts with their own saved hints use those
          instead.
        </p>
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={trimmed === saved || saveMutation.isPending}
            onClick={() => saveMutation.mutate(trimmed)}
          >
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
