/**
 * Credit card balance adjustment
 * Pure helpers that bring a statement's closing balance up to date with everything that has
 * happened on the card since: new charges, refunds and bill payments
 */

import { CARD_PAYMENT_CATEGORY } from '../lib/card-payment-matching'

export interface LinkedCardPayment {
  date: string // YYYY-MM-DD
  amount: number
}

/** A transaction recorded on the card itself */
export interface CardActivity {
  date: string // YYYY-MM-DD
  type: 'debit' | 'credit'
  amount: number
  category: string | null
}

export interface CardBalanceResult {
  /** What is owed now: closing balance plus later charges, minus later payments and refunds (null if no statement) */
  balance: number | null
  /** Closing balance as printed on the latest statement */
  statementBalance: number | null
  /** Total of bill payments dated strictly after the statement end */
  paymentsSinceStatement: number
  /** Date of the most recent payment counted, if any */
  lastPaymentDate: string | null
}

function round2(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100
  return rounded === 0 ? 0 : rounded // normalise -0
}

/**
 * Compute what is owed on a credit card right now.
 * Starts from the latest statement's closing balance, then adds charges and subtracts refunds
 * and bill payments dated after the statement end. A transaction dated on the statement end date
 * is assumed to already be on the statement. Overpayment yields a negative (credit) balance.
 *
 * A bill payment can be known from the bank side (`linkedPayments`) and from the card side (a
 * payment credit in `activity`), and the two are the same money. Whichever side has recorded more
 * is used, so a payment is never counted twice and one-sided data still counts.
 */
export function computeCardBalance(
  statementBalance: number | null,
  statementEnd: string | null,
  linkedPayments: LinkedCardPayment[],
  activity: CardActivity[] = []
): CardBalanceResult {
  if (statementBalance === null || statementEnd === null) {
    return {
      balance: statementBalance === null ? null : round2(statementBalance),
      statementBalance: statementBalance === null ? null : round2(statementBalance),
      paymentsSinceStatement: 0,
      lastPaymentDate: null,
    }
  }

  const bankPayments = linkedPayments.filter((p) => p.date > statementEnd)
  const recent = activity.filter((a) => a.date > statementEnd)
  const cardPayments = recent.filter(
    (a) => a.type === 'credit' && a.category === CARD_PAYMENT_CATEGORY
  )
  const charges = recent.filter((a) => a.type === 'debit')
  const refunds = recent.filter((a) => a.type === 'credit' && a.category !== CARD_PAYMENT_CATEGORY)

  const sum = (items: { amount: number }[]) => items.reduce((total, item) => total + item.amount, 0)
  const bankTotal = round2(sum(bankPayments))
  const cardTotal = round2(sum(cardPayments))
  const counted = cardTotal > bankTotal ? cardPayments : bankPayments
  const paid = Math.max(bankTotal, cardTotal)

  const lastPaymentDate = counted.reduce<string | null>(
    (latest, p) => (latest === null || p.date > latest ? p.date : latest),
    null
  )

  return {
    balance: round2(statementBalance - paid + sum(charges) - sum(refunds)),
    statementBalance: round2(statementBalance),
    paymentsSinceStatement: paid,
    lastPaymentDate,
  }
}
