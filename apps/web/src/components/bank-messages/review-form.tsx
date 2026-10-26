/**
 * Form to finish a bank message that could not be imported automatically
 */

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
import { useDismissPendingSms, useImportPendingSms } from '@/hooks'
import type { Account, PendingSms } from '@/lib/api'

function toDateInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

interface ReviewFormProps {
  message: PendingSms
  accounts: Account[]
  onDone: () => void
  onCancel: () => void
}

export function ReviewForm({ message, accounts, onDone, onCancel }: ReviewFormProps) {
  const importMutation = useImportPendingSms()
  const dismissMutation = useDismissPendingSms()

  const suggestedAccount = accounts.find((a) => a.id === message.accountId)
  // A charge in another currency is listed converted on the statement, so it cannot be added in
  // the original amount: the user enters the amount charged in the account's own currency
  const foreignCharge =
    !!suggestedAccount && !!message.currency && message.currency !== suggestedAccount.currency

  const [accountId, setAccountId] = useState(message.accountId ?? '')
  const [merchant, setMerchant] = useState(message.merchant ?? '')
  const [amount, setAmount] = useState(
    message.amount !== null && !foreignCharge ? String(message.amount) : ''
  )
  const [currency, setCurrency] = useState(
    foreignCharge ? suggestedAccount.currency : (message.currency ?? '')
  )
  const [type, setType] = useState<'credit' | 'debit'>(message.type ?? 'debit')
  const [date, setDate] = useState(message.date ?? toDateInput(message.receivedAt))

  const account = accounts.find((a) => a.id === accountId)
  const amountValue = Number(amount)
  const resolvedCurrency = currency || account?.currency || ''
  const currencyMatchesAccount = !account || resolvedCurrency.toUpperCase() === account.currency
  const canImport =
    !!account &&
    merchant.trim() !== '' &&
    Number.isFinite(amountValue) &&
    amountValue > 0 &&
    currencyMatchesAccount &&
    date !== ''
  const busy = importMutation.isPending || dismissMutation.isPending

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted/40 p-3">
        <p className="mb-1 text-xs text-muted-foreground">
          {message.sender} · {new Date(message.receivedAt).toLocaleString()}
        </p>
        <p className="text-sm">{message.body}</p>
      </div>

      {foreignCharge && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <p className="font-medium text-foreground">
            Charged in {message.currency}
            {message.amount !== null && ` (${message.amount})`}
          </p>
          <p className="mt-0.5 text-muted-foreground">
            Your statement will list this in {suggestedAccount.currency}. Enter the amount charged
            in {suggestedAccount.currency} to add it so it can be matched later, or dismiss it and
            let the statement bring it in.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">
            Card / account{message.last4 ? ` (ending ${message.last4})` : ''}
          </Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose an account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.accountName ?? a.institution ?? 'Account'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Merchant</Label>
          <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Amount</Label>
          <div className="flex gap-2">
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Input
              className="w-20 shrink-0 uppercase"
              aria-invalid={!currencyMatchesAccount}
              maxLength={3}
              placeholder={account?.currency ?? 'INR'}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </div>
          {!currencyMatchesAccount && account && (
            <p className="text-xs text-destructive">This account is in {account.currency}.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as 'credit' | 'debit')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="debit">Spent</SelectItem>
              <SelectItem value="credit">Refund / credit</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          disabled={busy}
          onClick={() => dismissMutation.mutate(message.id, { onSuccess: onDone })}
        >
          {dismissMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Dismiss
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={!canImport || busy}
            onClick={() =>
              importMutation.mutate(
                {
                  id: message.id,
                  data: {
                    accountId,
                    date,
                    amount: amountValue,
                    currency: resolvedCurrency.toUpperCase(),
                    type,
                    merchant: merchant.trim(),
                  },
                },
                { onSuccess: onDone }
              )
            }
          >
            {importMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add transaction
          </Button>
        </div>
      </div>
    </div>
  )
}
