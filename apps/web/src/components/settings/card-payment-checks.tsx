/**
 * Data Health: card payments that may be missing their other side
 */

import { useState } from 'react'
import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CardPaymentLinkPanel } from '@/components/transactions/card-payment-link-panel'
import { formatCurrency } from '@/components/dashboard/utils'
import { useDismissCardPayments, useLinkToCard, useLinkTransactions } from '@/hooks'
import type { DataHealthCardPayment, DataHealthCardPaymentKind } from '@/lib/api'
import { MetaLabel } from '@/components/ui/meta-label'

const KIND_LABELS: Record<DataHealthCardPaymentKind, { label: string; detail: string }> = {
  unlinked_debit: {
    label: 'Card bill payment not linked to a card',
    detail: 'Until it is linked, the card balance and your spending may be off.',
  },
  card_credit_without_bank: {
    label: 'Payment on a card with no bank payment found',
    detail: 'Your bank statements cover this date, but no matching payment was found.',
  },
  broken_link: {
    label: 'Card payment link is broken',
    detail: 'It points at a bank payment that no longer points back.',
  },
}

function formatShortDate(date: string): string {
  return new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function describeSuggestion(item: DataHealthCardPayment): string | null {
  const { suggestion } = item
  if (!suggestion) return null
  if (suggestion.kind === 'card') return `${suggestion.accountName}: ${suggestion.reason}`
  const name = suggestion.summary || 'Payment'
  return `${name} ${formatCurrency(suggestion.amount)} · ${formatShortDate(suggestion.date)} · ${suggestion.accountName}`
}

interface CardPaymentRowProps {
  item: DataHealthCardPayment
  onChoose: (item: DataHealthCardPayment) => void
}

function CardPaymentRow({ item, onChoose }: CardPaymentRowProps) {
  const linkMutation = useLinkTransactions()
  const cardMutation = useLinkToCard()
  const dismissMutation = useDismissCardPayments()
  const busy = linkMutation.isPending || cardMutation.isPending || dismissMutation.isPending
  const { label, detail } = KIND_LABELS[item.kind]
  const suggestionText = describeSuggestion(item)

  const link = () => {
    const { suggestion } = item
    if (!suggestion) return
    if (suggestion.kind === 'card') {
      cardMutation.mutate({ transactionId: item.id, cardId: suggestion.accountId })
    } else {
      linkMutation.mutate({
        transactionId1: item.id,
        transactionId2: suggestion.transactionId,
        linkType: 'payment',
      })
    }
  }

  return (
    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          {formatCurrency(item.amount)} · {formatShortDate(item.date)} · {item.accountName}
          {item.summary ? ` · ${item.summary}` : ''}
        </p>
        <p className="text-xs text-muted-foreground">{detail}</p>
        {suggestionText && <p className="truncate text-xs">Suggested: {suggestionText}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {item.suggestion ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={link}>
            Link
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onChoose(item)}>
            Choose…
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          disabled={busy}
          onClick={() => dismissMutation.mutate({ transactionIds: [item.id], dismissed: true })}
        >
          Mark as correct
        </Button>
      </div>
    </div>
  )
}

interface CardPaymentChecksProps {
  items: DataHealthCardPayment[]
}

/** The open card payment checks, each with its best link and a way to mark it as correct */
export function CardPaymentChecks({ items }: CardPaymentChecksProps) {
  const [choosing, setChoosing] = useState<DataHealthCardPayment | null>(null)
  if (items.length === 0) return null

  return (
    <div className="space-y-1">
      <MetaLabel as="p">Card payments to check</MetaLabel>
      <div className="divide-y divide-border-subtle">
        {items.map((item) => (
          <CardPaymentRow key={item.id} item={item} onChoose={setChoosing} />
        ))}
      </div>
      <Dialog open={choosing !== null} onOpenChange={(open) => !open && setChoosing(null)}>
        <DialogContent className="min-w-0">
          <DialogHeader>
            <DialogTitle>Link card payment</DialogTitle>
            <DialogDescription>
              {choosing
                ? `${formatCurrency(choosing.amount)} · ${formatShortDate(choosing.date)} · ${choosing.accountName}`
                : null}
            </DialogDescription>
          </DialogHeader>
          {choosing && <CardPaymentLinkPanel transaction={choosing} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface DismissedCardPaymentProps {
  item: DataHealthCardPayment
}

/** A card payment check marked as correct, with a way to bring it back */
export function DismissedCardPayment({ item }: DismissedCardPaymentProps) {
  const dismissMutation = useDismissCardPayments()
  return (
    <div className="group/row flex items-center gap-1 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted-foreground">{KIND_LABELS[item.kind].label}</p>
        <p className="text-xs text-muted-foreground">
          {formatCurrency(item.amount)} · {formatShortDate(item.date)} · {item.accountName}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100"
        title="Check this again"
        aria-label="Check this again"
        disabled={dismissMutation.isPending}
        onClick={() => dismissMutation.mutate({ transactionIds: [item.id], dismissed: false })}
      >
        <Eye className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
