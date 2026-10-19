import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SubscriptionFrequency } from '@/lib/api'

interface FrequencySelectProps {
  value: SubscriptionFrequency | undefined
  onChange: (frequency: SubscriptionFrequency) => void
  disabled?: boolean
}

/**
 * Pick how often a subscription is billed
 */
export function FrequencySelect({ value, onChange, disabled }: FrequencySelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as SubscriptionFrequency)}
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Choose frequency" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="monthly">Monthly</SelectItem>
        <SelectItem value="quarterly">Quarterly</SelectItem>
        <SelectItem value="yearly">Yearly</SelectItem>
      </SelectContent>
    </Select>
  )
}
