/**
 * Comparing and restoring the column values an auto-fix records. Pure, so the undo conflict
 * check can be tested without a database.
 *
 * Recorded values are JSON-safe and the same on SQLite and Postgres: decimals as numbers (Postgres
 * hands back numeric strings, SQLite floats) and timestamps as ISO strings (Postgres hands back Dates).
 */

/** Columns that are numeric strings on Postgres and floats on SQLite */
const DECIMAL_COLUMNS = new Set([
  'amount',
  'balance',
  'categoryConfidence',
  'openingBalance',
  'closingBalance',
])

/** Timestamp columns, which are Dates on Postgres */
const TIMESTAMP_COLUMNS = new Set(['createdAt', 'updatedAt'])

/** A column value in the form recorded in a change */
export function recordValue(column: string, value: unknown): unknown {
  if (value === undefined || value === null) return null
  if (value instanceof Date) return value.toISOString()
  if (DECIMAL_COLUMNS.has(column)) return Number(value)
  return value
}

/** A recorded value in the form the database driver wants back */
export function columnValue(column: string, value: unknown, postgres: boolean): unknown {
  if (value === null || value === undefined) return null
  if (postgres && DECIMAL_COLUMNS.has(column)) return String(value)
  if (postgres && TIMESTAMP_COLUMNS.has(column) && typeof value === 'string') return new Date(value)
  return value
}

function sameValue(column: string, a: unknown, b: unknown): boolean {
  const left = recordValue(column, a)
  const right = recordValue(column, b)
  if (DECIMAL_COLUMNS.has(column) && typeof left === 'number' && typeof right === 'number') {
    return Math.abs(left - right) < 0.0001
  }
  return left === right
}

/** True when every column recorded in `after` still has that value in `current` */
export function valuesMatch(
  current: Record<string, unknown>,
  after: Record<string, unknown>
): boolean {
  return Object.entries(after).every(([column, value]) => sameValue(column, current[column], value))
}

/** The columns of `before` and `after` whose value differs, each side holding only those */
export function changedColumns(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  columns: readonly string[]
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const changedBefore: Record<string, unknown> = {}
  const changedAfter: Record<string, unknown> = {}
  for (const column of columns) {
    if (sameValue(column, before[column], after[column])) continue
    changedBefore[column] = recordValue(column, before[column])
    changedAfter[column] = recordValue(column, after[column])
  }
  return Object.keys(changedAfter).length > 0
    ? { before: changedBefore, after: changedAfter }
    : null
}

/** Every column of a row in recorded form, for re-inserting a deleted row */
export function fullRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([column, v]) => [column, recordValue(column, v)])
  )
}

/** Id of a fix: the fixer and the rows it touches, so the same finding gets the same id every time */
export function makeFixId(fixer: string, entityIds: string[]): string {
  return `${fixer}:${entityIds.join('+')}`
}
