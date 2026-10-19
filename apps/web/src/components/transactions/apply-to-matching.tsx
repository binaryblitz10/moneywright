import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { TermChipsInput } from './term-chips-input'

export interface ApplyToMatchingState {
  terms: string[]
  updateExisting: boolean
  saveRule: boolean
}

interface ApplyToMatchingProps {
  state: ApplyToMatchingState
  onChange: (state: ApplyToMatchingState) => void
  /** Number of other transactions the terms match (the edited ones are left out) */
  count: number
  /** Descriptions of a few of the other matching transactions */
  samples: string[]
  isFetching: boolean
}

/** "Create Rule" field: apply an edit to other matching transactions and remember it as a rule */
export function ApplyToMatching({
  state,
  onChange,
  count,
  samples,
  isFetching,
}: ApplyToMatchingProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="rule-terms">Create Rule</Label>
      <TermChipsInput
        id="rule-terms"
        value={state.terms}
        onChange={(terms) => onChange({ ...state, terms })}
        placeholder="Description contains... (press Enter to add)"
      />

      {state.terms.length > 0 && (
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            Matches {count} other transaction{count === 1 ? '' : 's'}
            {isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
          </p>
          {samples.map((sample, index) => (
            <p key={index} className="truncate text-xs text-muted-foreground">
              {sample}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {count > 0 && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="update-matching"
              checked={state.updateExisting}
              onCheckedChange={(checked) =>
                onChange({ ...state, updateExisting: checked === true })
              }
            />
            <Label htmlFor="update-matching" className="font-normal">
              Update those {count} transaction{count === 1 ? '' : 's'} now
            </Label>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Checkbox
            id="save-rule"
            checked={state.saveRule}
            onCheckedChange={(checked) => onChange({ ...state, saveRule: checked === true })}
          />
          <Label htmlFor="save-rule" className="font-normal">
            Save Rule
          </Label>
        </div>
      </div>
    </div>
  )
}
