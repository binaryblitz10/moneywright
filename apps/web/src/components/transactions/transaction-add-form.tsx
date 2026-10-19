import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Account, Category } from '@/lib/api'
import { useCreateTransaction } from '@/hooks'
import { CategoryPicker } from './category-picker'
import { TransactionMoneyFields } from './transaction-money-fields'
import {
  areMoneyValuesValid,
  parseAmount,
  type TransactionMoneyValues,
} from '@/lib/transaction-money'

interface TransactionAddFormProps {
  accounts: Account[]
  categories: Category[]
  onClose: () => void
  onSuccess: () => void
}

function todayIso(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function accountLabel(account: Account): string {
  const name = account.accountName || account.institution || account.type.replace(/_/g, ' ')
  return account.accountNumber ? `${name} ••${account.accountNumber.slice(-4)}` : name
}

/** Add a transaction that is not in any statement (cash expense, row the parser missed) */
export function TransactionAddForm({
  accounts,
  categories,
  onClose,
  onSuccess,
}: TransactionAddFormProps) {
  const [accountId, setAccountId] = useState(accounts.length === 1 ? accounts[0]!.id : '')
  const [summary, setSummary] = useState('')
  const [category, setCategory] = useState('')
  const [money, setMoney] = useState<TransactionMoneyValues>({
    date: todayIso(),
    amount: '',
    type: 'debit',
  })
  const createMutation = useCreateTransaction()

  const amount = parseAmount(money.amount)
  const canSave =
    !!accountId && !!summary.trim() && !!category && areMoneyValuesValid(money) && amount !== null

  const handleSave = () => {
    if (!canSave || amount === null) return
    createMutation.mutate(
      {
        accountId,
        date: money.date,
        amount,
        type: money.type,
        summary: summary.trim(),
        category,
      },
      { onSuccess }
    )
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="space-y-2">
        <Label htmlFor="add-account">Account</Label>
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger id="add-account" className="w-full">
            <SelectValue placeholder="Select an account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {accountLabel(account)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="add-summary">Name</Label>
        <Input
          id="add-summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="e.g. Auto fare"
          maxLength={200}
        />
      </div>

      <TransactionMoneyFields values={money} onChange={setMoney} idPrefix="add" />

      <div className="space-y-2">
        <Label htmlFor="add-category">Category</Label>
        <CategoryPicker
          id="add-category"
          categories={categories}
          value={category}
          onChange={setCategory}
        />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!canSave || createMutation.isPending}>
          {createMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Adding...
            </>
          ) : (
            'Add Transaction'
          )}
        </Button>
      </div>
    </div>
  )
}
