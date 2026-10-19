/**
 * Duplicate detection helpers shared by the duplicate review list and statement import,
 * so both always agree on what counts as "the same transaction".
 */

export interface DuplicateKeyInput {
  accountId: string
  date: string
  type: string
  amount: number
  description: string
}

/**
 * Key identifying a likely-identical transaction: same account, date, type, amount (to 2 decimals)
 * and description (case and whitespace insensitive).
 */
export function duplicateKey(input: DuplicateKeyInput): string {
  const description = input.description.toLowerCase().replace(/\s+/g, ' ').trim()
  return [input.accountId, input.date, input.type, input.amount.toFixed(2), description].join('|')
}

/**
 * Pick the rows that still need inserting when some of them already exist.
 * For each key, a file with N rows and an account that already holds M of them
 * inserts N - M rows: the first M occurrences in file order are skipped, so identical
 * same-day rows inside one file are kept unless they are already present.
 */
export function selectRowsToInsert<T>(
  rows: T[],
  existingCounts: ReadonlyMap<string, number>,
  keyOf: (row: T) => string
): { toInsert: T[]; skipped: number } {
  const remaining = new Map(existingCounts)
  const toInsert: T[] = []
  let skipped = 0
  for (const row of rows) {
    const key = keyOf(row)
    const left = remaining.get(key) ?? 0
    if (left > 0) {
      remaining.set(key, left - 1)
      skipped++
    } else {
      toInsert.push(row)
    }
  }
  return { toInsert, skipped }
}
