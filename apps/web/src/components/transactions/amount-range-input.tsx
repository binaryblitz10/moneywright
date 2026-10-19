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

const inputClass = 'h-10 rounded-md border border-input bg-background px-3 py-2'

interface AmountRangeInputProps {
  id?: string
  value: AmountRangeValue
  onChange: (value: AmountRangeValue) => void
}

/** Amount filter for rules: any amount, above, below or between (limits are inclusive) */
export function AmountRangeInput({ id, value, onChange }: AmountRangeInputProps) {
  const { mode } = value
  const isInvalid =
    mode === 'between' && toAmountLimits(value) === null && !!value.min && !!value.max

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Select
          value={mode}
          onValueChange={(next) => onChange({ ...value, mode: next as AmountMode })}
        >
          <SelectTrigger id={id} className={mode === 'any' ? 'w-full' : 'w-32 shrink-0'}>
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
        {(mode === 'above' || mode === 'between') && (
          <Input
            inputMode="decimal"
            aria-label="Lowest amount"
            placeholder={mode === 'between' ? 'From' : 'Amount'}
            value={value.min}
            onChange={(e) => onChange({ ...value, min: e.target.value })}
            className={inputClass}
          />
        )}
        {(mode === 'below' || mode === 'between') && (
          <Input
            inputMode="decimal"
            aria-label="Highest amount"
            placeholder={mode === 'between' ? 'To' : 'Amount'}
            value={value.max}
            onChange={(e) => onChange({ ...value, max: e.target.value })}
            className={inputClass}
          />
        )}
      </div>
      {isInvalid && (
        <p className="text-xs text-destructive">
          The first amount must not be more than the second.
        </p>
      )}
    </div>
  )
}
