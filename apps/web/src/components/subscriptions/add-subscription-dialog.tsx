import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAddSubscription, useDebounce } from '@/hooks'
import { getTransactions } from '@/lib/api'
import type { SubscriptionFrequency } from '@/lib/api'
import { cn } from '@/lib/utils'
import { FrequencySelect } from './frequency-select'

interface AddSubscriptionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profileId: string | undefined
  currency: string
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Add a subscription that was not detected: find one of its payments, pick how often it repeats
 */
export function AddSubscriptionDialog({
  open,
  onOpenChange,
  profileId,
  currency,
}: AddSubscriptionDialogProps) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [frequency, setFrequency] = useState<SubscriptionFrequency>('monthly')
  const debouncedSearch = useDebounce(search.trim(), 300)
  const addSubscription = useAddSubscription()

  const { data, isFetching } = useQuery({
    queryKey: ['subscription-candidates', profileId ?? 'family', debouncedSearch],
    queryFn: () =>
      getTransactions(
        { profileId, type: 'debit', search: debouncedSearch || undefined },
        { limit: 10, sortBy: 'date', sortOrder: 'desc' }
      ),
    enabled: open,
  })
  const transactions = data?.transactions ?? []

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSearch('')
      setSelectedId(null)
      setFrequency('monthly')
    }
    onOpenChange(next)
  }

  const handleAdd = () => {
    if (!selectedId) return
    addSubscription.mutate(
      { transactionId: selectedId, frequency },
      { onSuccess: () => handleOpenChange(false) }
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add subscription</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Pick one payment of the subscription. All payments to the same name are added.
        </p>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search your payments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="max-h-64 overflow-y-auto space-y-1 -mx-2 px-2">
          {isFetching && transactions.length === 0 ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : transactions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No payments found</p>
          ) : (
            transactions.map((txn) => (
              <button
                key={txn.id}
                type="button"
                onClick={() => setSelectedId(txn.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                  selectedId === txn.id
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-transparent hover:bg-surface-hover'
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {txn.summary || txn.originalDescription}
                  </p>
                  <p className="text-xs text-muted-foreground">{txn.date}</p>
                </div>
                <span className="shrink-0 text-sm tabular-nums">
                  {formatAmount(txn.amount, currency)}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Repeats</Label>
          <FrequencySelect value={frequency} onChange={setFrequency} />
        </div>

        <Button onClick={handleAdd} disabled={!selectedId || addSubscription.isPending}>
          {addSubscription.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Add subscription
        </Button>
      </DialogContent>
    </Dialog>
  )
}
