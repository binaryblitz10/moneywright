import { Loader2, Link2, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/components/dashboard/utils'
import {
  useAccounts,
  useLinkSuggestions,
  useLinkToCard,
  useLinkTransactions,
  useUnlinkTransaction,
} from '@/hooks'
import type { LinkSuggestion, Transaction } from '@/lib/api'

type TransactionSuggestion = Extract<LinkSuggestion, { kind: 'transaction' }>
type CardSuggestion = Extract<LinkSuggestion, { kind: 'card' }>

interface CardPaymentLinkPanelProps {
  /** The card payment: a bank debit or a card credit */
  transaction: Pick<Transaction, 'id' | 'type'>
  /** The category chosen in the edit form, when it is not saved yet */
  category?: string
}

function formatShortDate(date: string): string {
  return new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  })
}

/** "Payment received ₹12,000 · 20 Oct · HDFC Regalia" */
function describeTransaction(transaction: Transaction, accountName: string): string {
  const name = transaction.summary || transaction.originalDescription
  return `${name} ${formatCurrency(transaction.amount)} · ${formatShortDate(transaction.date)} · ${accountName}`
}

/** How far a candidate is from the payment, in plain words */
function describeDifference(candidate: TransactionSuggestion): string {
  const amount =
    candidate.amountDiff < 0.01
      ? 'same amount'
      : `${formatCurrency(candidate.amountDiff)} different`
  const days =
    candidate.dayDiff === 0
      ? 'same day'
      : `${candidate.dayDiff} day${candidate.dayDiff === 1 ? '' : 's'} apart`
  return `${amount}, ${days}`
}

interface CandidateRowProps {
  title: string
  detail: string
  actionLabel: string
  disabled: boolean
  onAction: () => void
}

function CandidateRow({ title, detail, actionLabel, disabled, onAction }: CandidateRowProps) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border bg-background p-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        disabled={disabled}
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </div>
  )
}

/**
 * Links a card bill payment with its other side. A bank debit can be linked to the card's
 * "payment received" line, or just to the card until the card statement is uploaded;
 * a card credit is linked to the bank debit that paid it. Changes apply straight away.
 */
export function CardPaymentLinkPanel({ transaction, category }: CardPaymentLinkPanelProps) {
  const isDebit = transaction.type === 'debit'
  const { data: suggestions, isLoading } = useLinkSuggestions(transaction.id, category)
  const { data: accounts } = useAccounts(undefined, { enabled: isDebit })
  const linkMutation = useLinkTransactions()
  const cardMutation = useLinkToCard()
  const unlinkMutation = useUnlinkTransaction()
  const busy = linkMutation.isPending || cardMutation.isPending || unlinkMutation.isPending

  const linkTo = (candidate: TransactionSuggestion) =>
    linkMutation.mutate({
      transactionId1: transaction.id,
      transactionId2: candidate.transaction.id,
      linkType: 'payment',
    })
  const linkToCard = (cardId: string) =>
    cardMutation.mutate({ transactionId: transaction.id, cardId })

  const renderCandidate = (candidate: LinkSuggestion) =>
    candidate.kind === 'transaction' ? (
      <CandidateRow
        key={candidate.transaction.id}
        title={describeTransaction(candidate.transaction, candidate.accountName)}
        detail={describeDifference(candidate)}
        actionLabel="Link"
        disabled={busy}
        onAction={() => linkTo(candidate)}
      />
    ) : (
      <CandidateRow
        key={candidate.accountId}
        title={`Link to ${candidate.accountName} only`}
        detail={candidate.reason}
        actionLabel="Link to card"
        disabled={busy}
        onAction={() => linkToCard(candidate.accountId)}
      />
    )

  const renderBody = () => {
    if (isLoading || !suggestions) return <Skeleton className="h-10 w-full" />
    const { linked, candidates, best } = suggestions
    const transactionCandidates = candidates.filter(
      (c): c is TransactionSuggestion => c.kind === 'transaction'
    )
    const cardCandidates = candidates.filter((c): c is CardSuggestion => c.kind === 'card')

    if (linked.kind === 'pair') {
      return (
        <div className="flex min-w-0 items-center justify-between gap-3">
          <p className="min-w-0 text-sm">
            Linked to{' '}
            <span className="font-medium">
              {describeTransaction(linked.transaction, linked.accountName)}
            </span>
          </p>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            disabled={busy}
            onClick={() => unlinkMutation.mutate(transaction.id)}
          >
            <Unlink className="mr-2 h-4 w-4" />
            Unlink
          </Button>
        </div>
      )
    }

    if (linked.kind === 'card') {
      return (
        <div className="space-y-3">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <p className="min-w-0 text-sm">
              Linked to <span className="font-medium">{linked.accountName}</span>. It will be
              matched with the card statement when it's uploaded.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              disabled={busy}
              onClick={() => unlinkMutation.mutate(transaction.id)}
            >
              <Unlink className="mr-2 h-4 w-4" />
              Unlink
            </Button>
          </div>
          {transactionCandidates.length > 0 && (
            <div className="min-w-0 space-y-2">
              <p className="text-xs text-muted-foreground">
                These payments on the card statement could be this one:
              </p>
              {transactionCandidates.map(renderCandidate)}
            </div>
          )}
        </div>
      )
    }

    if (best?.kind === 'transaction') {
      return (
        <div className="min-w-0 space-y-2">
          <p className="text-xs text-muted-foreground">This matches:</p>
          {renderCandidate(best)}
        </div>
      )
    }

    if (candidates.length > 0) {
      return (
        <div className="min-w-0 space-y-2">
          <p className="text-xs text-muted-foreground">
            {best
              ? 'This payment looks like it went to:'
              : isDebit
                ? 'This could be one of these:'
                : 'This could be paid by one of these:'}
          </p>
          {candidates.map(renderCandidate)}
          {transactionCandidates.length > 0 && cardCandidates.length === 0 && isDebit && (
            <p className="text-xs text-muted-foreground">
              Not one of them? Choose a card below to link to the card only.
            </p>
          )}
          {isDebit && cardCandidates.length === 0 && renderCardPicker()}
        </div>
      )
    }

    return (
      <div className="min-w-0 space-y-2">
        <p className="text-sm text-muted-foreground">
          {isDebit
            ? 'No matching payment found on your card statements yet.'
            : 'No matching payment found in your bank statements.'}
        </p>
        {isDebit && renderCardPicker()}
      </div>
    )
  }

  const renderCardPicker = () => {
    const cards = accounts?.filter((a) => a.type === 'credit_card') ?? []
    if (cards.length === 0) return null
    return (
      <Select value="" onValueChange={linkToCard} disabled={busy}>
        <SelectTrigger aria-label="Link to a card">
          <SelectValue placeholder="Link to a card only" />
        </SelectTrigger>
        <SelectContent>
          {cards.map((card) => (
            <SelectItem key={card.id} value={card.id}>
              {card.accountName}
              {card.accountNumber ? ` ••${card.accountNumber.slice(-4)}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return (
    <div className="min-w-0 space-y-2">
      <Label className="flex items-center gap-2">
        <Link2 className="h-4 w-4" />
        Linked payment
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </Label>
      <div className="min-w-0 rounded-lg border bg-muted/30 p-3">{renderBody()}</div>
      <p className="text-xs text-muted-foreground">
        Linking a payment keeps your card balance right and stops it counting as spending twice.
      </p>
    </div>
  )
}
