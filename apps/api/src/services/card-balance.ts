/**
 * Credit card balance adjustment
 * Pure helpers that apply payments made after the latest statement to its closing balance
 */

export interface LinkedCardPayment {
  date: string // YYYY-MM-DD
  amount: number
}

export interface CardBalanceResult {
  /** Statement closing balance minus payments made after the statement (null if no statement) */
  balance: number | null
  /** Closing balance as printed on the latest statement */
  statementBalance: number | null
  /** Total of payments dated strictly after the statement end */
  paymentsSinceStatement: number
  /** Date of the most recent payment counted, if any */
  lastPaymentDate: string | null
}

function round2(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100
  return rounded === 0 ? 0 : rounded // normalise -0
}

/**
 * Compute a credit card's balance after payments made since its latest statement.
 * A payment dated on the statement end date is assumed to already be on the statement.
 * Overpayment yields a negative (credit) balance.
 */
export function computeCardBalance(
  statementBalance: number | null,
  statementEnd: string | null,
  linkedPayments: LinkedCardPayment[]
): CardBalanceResult {
  if (statementBalance === null || statementEnd === null) {
    return {
      balance: statementBalance === null ? null : round2(statementBalance),
      statementBalance: statementBalance === null ? null : round2(statementBalance),
      paymentsSinceStatement: 0,
      lastPaymentDate: null,
    }
  }

  const counted = linkedPayments.filter((p) => p.date > statementEnd)
  const paid = round2(counted.reduce((sum, p) => sum + p.amount, 0))
  const lastPaymentDate = counted.reduce<string | null>(
    (latest, p) => (latest === null || p.date > latest ? p.date : latest),
    null
  )

  return {
    balance: round2(statementBalance - paid),
    statementBalance: round2(statementBalance),
    paymentsSinceStatement: paid,
    lastPaymentDate,
  }
}
