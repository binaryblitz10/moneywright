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

function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Average end-of-day balance over the `days` days ending on `endDate`. The balance is rebuilt by
 * walking back from today's balance, undoing each day's credits and debits.
 */
export function computeAverageBalance(
  currentBalance: number,
  activity: BankActivity[],
  endDate: string,
  days: number
): number {
  const netByDate = new Map<string, number>()
  for (const a of activity) {
    if (a.date > endDate) continue
    netByDate.set(
      a.date,
      (netByDate.get(a.date) ?? 0) + (a.type === 'credit' ? a.amount : -a.amount)
    )
  }

  let balance = currentBalance
  let total = 0
  for (let i = 0; i < days; i++) {
    total += balance
    balance -= netByDate.get(shiftDay(endDate, -i)) ?? 0
  }
  return round2(total / days)
}
