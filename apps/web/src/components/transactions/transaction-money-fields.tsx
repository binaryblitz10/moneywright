import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { parseAmount, type TransactionMoneyValues } from '@/lib/transaction-money'

interface TransactionMoneyFieldsProps {
  values: TransactionMoneyValues
  onChange: (values: TransactionMoneyValues) => void
  idPrefix?: string
}

/** Date, amount and direction (money in / money out) inputs for a transaction */
export function TransactionMoneyFields({
  values,
  onChange,
  idPrefix = 'txn',
}: TransactionMoneyFieldsProps) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`${idPrefix}-date`}>Date</Label>
        <Input
          id={`${idPrefix}-date`}
          type="date"
          value={values.date}
          onChange={(e) => onChange({ ...values, date: e.target.value })}
        />
      </div>
      <div className="min-w-0 space-y-2">
        <Label htmlFor={`${idPrefix}-amount`}>Amount</Label>
        <Input
          id={`${idPrefix}-amount`}
          inputMode="decimal"
          value={values.amount}
          onChange={(e) => onChange({ ...values, amount: e.target.value })}
          placeholder="0.00"
          aria-invalid={values.amount !== '' && parseAmount(values.amount) === null}
        />
      </div>
      <div className="min-w-0 space-y-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-type`}>Type</Label>
        <Select
          value={values.type}
          onValueChange={(type) => onChange({ ...values, type: type as 'credit' | 'debit' })}
        >
          <SelectTrigger id={`${idPrefix}-type`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="credit">Money in</SelectItem>
            <SelectItem value="debit">Money out</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
