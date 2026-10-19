import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Loader2, Plus } from 'lucide-react'
import { TermChipsInput } from './term-chips-input'

export interface ApplyToMatchingState {
  terms: string[]
  updateExisting: boolean
}

interface ApplyToMatchingProps {
  state: ApplyToMatchingState
  onChange: (state: ApplyToMatchingState) => void
  /** Term offered as a one-click chip while no terms are added */
  suggestedTerm?: string
  /** All transactions the terms match, including the ones being edited */
  totalCount: number
  /** Matching transactions other than the ones being edited */
  count: number
  /** Descriptions of a few of the other matching transactions */
  samples: string[]
  isFetching: boolean
}

/**
 * "Create Rule" box: adding terms saves a rule with the edited name and category,
 * and can also apply them to other matching transactions
 */
export function ApplyToMatching({
  state,
  onChange,
  suggestedTerm,
  totalCount,
  count,
  samples,
  isFetching,
}: ApplyToMatchingProps) {
  const hasTerms = state.terms.length > 0

  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor="rule-terms">Create Rule</Label>
      <div className="min-w-0 space-y-3 rounded-xl border border-border-subtle bg-muted/30 p-4">
        <TermChipsInput
          id="rule-terms"
          value={state.terms}
          onChange={(terms) => onChange({ ...state, terms })}
          placeholder="Add term and press enter"
        />

        {!hasTerms && suggestedTerm && (
          <button
            type="button"
            onClick={() => onChange({ ...state, terms: [suggestedTerm] })}
            className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-dashed border-border-subtle px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-border-hover hover:text-foreground"
          >
            <Plus className="h-3 w-3 shrink-0" />
            <span className="truncate uppercase">{suggestedTerm}</span>
          </button>
        )}

        {hasTerms && (
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              Matches {totalCount} transaction{totalCount === 1 ? '' : 's'}
              {isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
            </p>
            {samples.map((sample, index) => (
              <p key={index} className="truncate text-xs text-muted-foreground">
                {sample}
              </p>
            ))}
          </div>
        )}

        {hasTerms && count > 0 && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="update-matching"
              checked={state.updateExisting}
              onCheckedChange={(checked) =>
                onChange({ ...state, updateExisting: checked === true })
              }
            />
            <Label htmlFor="update-matching" className="font-normal">
              Also update the other {count} transaction{count === 1 ? '' : 's'} now
            </Label>
          </div>
        )}
      </div>
    </div>
  )
}
