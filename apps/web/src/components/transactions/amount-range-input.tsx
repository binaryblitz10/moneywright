import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toAmountLimits, type AmountMode, type AmountRangeValue } from '@/lib/amount-range'

const MODE_LABELS: Record<AmountMode, string> = {
  any: 'Any amount',
  above: 'Above',
  below: 'Below',
  between: 'Between',
}

interface AmountRangeProps {
  value: AmountRangeValue
  onChange: (value: AmountRangeValue) => void
}

interface AmountModeSelectProps extends AmountRangeProps {
  id?: string
  className?: string
}

/** The "any amount / above / below / between" choice of the amount filter */
export function AmountModeSelect({ id, value, onChange, className }: AmountModeSelectProps) {
  return (
    <Select
      value={value.mode}
      onValueChange={(next) => onChange({ ...value, mode: next as AmountMode })}
    >
      <SelectTrigger id={id} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(MODE_LABELS) as AmountMode[]).map((key) => (
          <SelectItem key={key} value={key}>
            {MODE_LABELS[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** The amount boxes the chosen mode needs; nothing for "any amount" */
export function AmountValueInputs({ value, onChange }: AmountRangeProps) {
  const { mode } = value
  return (
    <>
      {(mode === 'above' || mode === 'between') && (
        <Input
          inputMode="decimal"
          aria-label="Lowest amount"
          placeholder={mode === 'between' ? 'From' : 'Amount'}
          value={value.min}
          onChange={(e) => onChange({ ...value, min: e.target.value })}
        />
      )}
      {(mode === 'below' || mode === 'between') && (
        <Input
          inputMode="decimal"
          aria-label="Highest amount"
          placeholder={mode === 'between' ? 'To' : 'Amount'}
          value={value.max}
          onChange={(e) => onChange({ ...value, max: e.target.value })}
        />
      )}
    </>
  )
}

/** Explains why a "between" range is not accepted; nothing when it is fine */
export function AmountRangeError({ value }: { value: AmountRangeValue }) {
  const isInvalid =
    value.mode === 'between' && toAmountLimits(value) === null && !!value.min && !!value.max
  if (!isInvalid) return null
  return (
    <p className="text-xs text-destructive">The first amount must not be more than the second.</p>
  )
}

interface AmountRangeInputProps extends AmountRangeProps {
  id?: string
}

/** Amount filter for rules: any amount, above, below or between (limits are inclusive) */
export function AmountRangeInput({ id, value, onChange }: AmountRangeInputProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <AmountModeSelect
          id={id}
          value={value}
          onChange={onChange}
          className={value.mode === 'any' ? 'w-full' : 'w-32 shrink-0'}
        />
        <AmountValueInputs value={value} onChange={onChange} />
      </div>
      <AmountRangeError value={value} />
    </div>
  )
}
