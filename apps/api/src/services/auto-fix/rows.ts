/**
 * Reading transaction rows around a fix, so what the fix changed can be recorded for undo.
 */

import { and, eq, inArray } from 'drizzle-orm'
import { db, tables } from '../../db'
import type { Transaction } from '../../db'
import { changedColumns, fullRow } from './values'
import type { ChangeRecord } from './types'

/** The columns a fix can change on a transaction */
export const TRANSACTION_COLUMNS = [
  'category',
  'categoryConfidence',
  'categorySource',
  'nameSource',
  'summary',
  'nameVersion',
  'isSubscription',
  'isManuallyCategorized',
  'isHidden',
  'notes',
  'smsVerified',
  'linkedEntityId',
  'linkedEntityType',
  'duplicateOfId',
] as const

/** Rows are read in chunks: a long list would overflow SQLite's variable limit in one IN list */
const CHUNK = 500

export function asRecord(row: object): Record<string, unknown> {
  return row as Record<string, unknown>
}

export async function loadTransactions(
  userId: string,
  ids: string[]
): Promise<Map<string, Transaction>> {
  const rows = new Map<string, Transaction>()
  for (let i = 0; i < ids.length; i += CHUNK) {
    const found = await db
      .select()
      .from(tables.transactions)
      .where(
        and(
          eq(tables.transactions.userId, userId),
          inArray(tables.transactions.id, ids.slice(i, i + CHUNK))
        )
      )
    for (const row of found) rows.set(row.id, row)
  }
  return rows
}

/** A transaction in a sentence, e.g. "SWIGGY INR 450.00 on 2025-10-03" */
export function transactionLabel(row: Transaction): string {
  const name = (row.summary || row.originalDescription).slice(0, 60)
  return `${name} ${row.currency} ${Number(row.amount).toFixed(2)} on ${row.date}`
}

/** Transactions whose link points at one of the given ones; changing a link can clear these too */
async function pointingAt(userId: string, ids: string[]): Promise<string[]> {
  const found: string[] = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    const rows = await db
      .select({ id: tables.transactions.id })
      .from(tables.transactions)
      .where(
        and(
          eq(tables.transactions.userId, userId),
          eq(tables.transactions.linkedEntityType, 'transaction'),
          inArray(tables.transactions.linkedEntityId, ids.slice(i, i + CHUNK))
        )
      )
    found.push(...rows.map((row) => row.id))
  }
  return found
}

/**
 * Run `change` and record what it did to the given transactions (and to any transaction that
 * pointed at one of them, since relinking clears those): one record per row whose columns
 * changed, or per row that was deleted.
 * `describe` words the record of a row the change was made for (given the row before and, unless
 * it was deleted, after); other rows get a generic sentence.
 */
export async function trackTransactions(
  userId: string,
  ids: string[],
  change: () => Promise<void>,
  describe: (before: Transaction, after: Transaction | undefined) => string
): Promise<ChangeRecord[]> {
  const watched = [...new Set([...ids, ...(await pointingAt(userId, ids))])]
  const before = await loadTransactions(userId, watched)
  await change()
  const after = await loadTransactions(userId, watched)

  const records: ChangeRecord[] = []
  for (const [id, was] of before) {
    const now = after.get(id)
    const description = ids.includes(id) ? describe(was, now) : `Updated ${transactionLabel(was)}`
    if (!now) {
      records.push({
        entityType: 'transaction',
        entityId: id,
        before: fullRow(asRecord(was)),
        after: null,
        description,
      })
      continue
    }
    const changed = changedColumns(asRecord(was), asRecord(now), TRANSACTION_COLUMNS)
    if (changed) records.push({ entityType: 'transaction', entityId: id, ...changed, description })
  }
  return records
}
