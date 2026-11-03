/**
 * Pure helpers behind the learned notes and the learning stats: spotting recurring credits,
 * reading stored timestamps and computing the AI accuracy. No I/O.
 */

/** A credit as read for spotting recurring income */
export interface CreditRow {
  fingerprint: string
  /** ISO date (YYYY-MM-DD) */
  date: string
  amount: number
  description: string
}

export interface RecurringCredit {
  fingerprint: string
  description: string
  months: number
  averageAmount: number
}

/** A credit has to show up in this many different months to count as recurring (salary-like) */
const MIN_RECURRING_MONTHS = 3
/** Accuracy is only reported once there are this many categorized rows to judge */
const MIN_ACCURACY_ROWS = 10

/** Credits from the same merchant in at least three distinct months, most frequent first */
export function findRecurringCredits(rows: CreditRow[]): RecurringCredit[] {
  const groups = new Map<
    string,
    { months: Set<string>; total: number; count: number; row: CreditRow }
  >()
  for (const row of rows) {
    if (!row.fingerprint) continue
    const group = groups.get(row.fingerprint) ?? {
      months: new Set<string>(),
      total: 0,
      count: 0,
      row,
    }
    group.months.add(row.date.slice(0, 7))
    group.total += row.amount
    group.count += 1
    if (row.date > group.row.date) group.row = row
    groups.set(row.fingerprint, group)
  }

  return [...groups.values()]
    .filter((group) => group.months.size >= MIN_RECURRING_MONTHS)
    .map((group) => ({
      fingerprint: group.row.fingerprint,
      description: group.row.description,
      months: group.months.size,
      averageAmount: Math.round(group.total / group.count),
    }))
    .sort((a, b) => b.months - a.months)
}

/** Milliseconds of a stored timestamp (ISO, SQLite `YYYY-MM-DD HH:MM:SS` in UTC, or Date) */
export function timestampMs(value: string | Date | null | undefined): number | null {
  if (!value) return null
  if (value instanceof Date) return value.getTime()
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(value) && value.includes('T')
  const iso = hasZone ? value : `${value.replace(' ', 'T')}Z`
  const ms = new Date(iso).getTime()
  return Number.isNaN(ms) ? null : ms
}

/**
 * Share of AI/memory answers the user did not change: 1 − corrections ÷ (rows still carrying an
 * AI/memory category + the corrected ones). Null when there is too little to judge.
 */
export function accuracyRate(corrections: number, uncorrectedRows: number): number | null {
  const total = uncorrectedRows + corrections
  if (total < MIN_ACCURACY_ROWS) return null
  return 1 - corrections / total
}
