/**
 * Bank account balance adjustment
 * Pure helper that brings a statement's closing balance up to date with the transactions
 * recorded since: credits add money, debits take it out
 */

export interface BankActivity {
  date: string // YYYY-MM-DD
  type: 'debit' | 'credit'
  amount: number
}

function round2(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100
  return rounded === 0 ? 0 : rounded // normalise -0
}

/**
 * What a bank account holds right now: the latest statement's closing balance plus credits and
 * minus debits dated after the statement end. A transaction dated on the statement end date is
 * assumed to already be on the statement. Null when there is no statement balance to start from.
 */
export function computeBankBalance(
  statementBalance: number | null,
  statementEnd: string | null,
  activity: BankActivity[]
): number | null {
  if (statementBalance === null) return null
  if (statementEnd === null) return round2(statementBalance)

  const change = activity
    .filter((a) => a.date > statementEnd)
    .reduce((total, a) => total + (a.type === 'credit' ? a.amount : -a.amount), 0)
  return round2(statementBalance + change)
}
