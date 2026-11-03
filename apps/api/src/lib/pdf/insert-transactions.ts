/**
 * Batch insert transactions extracted from PDF
 * Handles deduplication via hash and bulk inserts
 */

import { createHash } from 'crypto'
import { and, eq, gte, lte, ne, notLike } from 'drizzle-orm'
import { db, tables, dbType } from '../../db'
import { logger } from '../logger'
import { merchantFingerprint } from '../merchant-fingerprint'
import { selectRowsToInsert, type DuplicateKeyInput } from '../duplicate-key'
import { invalidateDuplicateCache } from '../../services/duplicates'
import { reconcileWithCounts } from '../../services/sms-matching'
import type { RawPdfTransaction, InsertResult } from './types'

/**
 * Batch size for inserts
 */
const INSERT_BATCH_SIZE = 100

/**
 * Generate transaction hash for deduplication
 * Hash is based on account, date, amount, description, and position within the statement
 * Position is included to allow identical transactions (same date/amount/description)
 * that appear multiple times in the same statement (e.g., two identical purchases)
 */
function generateTransactionHash(
  accountId: string,
  date: string,
  amount: number,
  description: string,
  position: number
): string {
  const data = `${accountId}|${date}|${amount}|${description}|${position}`
  return createHash('sha256').update(data).digest('hex')
}

/** Days either side of the incoming date range searched, as a shared reference matches across days */
const REFERENCE_WINDOW_DAYS = 3

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted.toISOString().slice(0, 10)
}

/**
 * List the account's existing transactions from other statements around the date range of the
 * incoming rows. Hidden transactions count: they still exist.
 */
async function findExistingTransactions(
  accountId: string,
  statementId: string,
  transactions: RawPdfTransaction[]
): Promise<DuplicateKeyInput[]> {
  if (transactions.length === 0) return []

  let minDate = transactions[0]!.date
  let maxDate = minDate
  for (const txn of transactions) {
    if (txn.date < minDate) minDate = txn.date
    if (txn.date > maxDate) maxDate = txn.date
  }

  const rows = await db
    .select({
      date: tables.transactions.date,
      type: tables.transactions.type,
      amount: tables.transactions.amount,
      description: tables.transactions.originalDescription,
    })
    .from(tables.transactions)
    .where(
      and(
        eq(tables.transactions.accountId, accountId),
        ne(tables.transactions.statementId, statementId),
        gte(tables.transactions.date, shiftDate(minDate, -REFERENCE_WINDOW_DAYS)),
        lte(tables.transactions.date, shiftDate(maxDate, REFERENCE_WINDOW_DAYS)),
        // Bank message alerts are matched with the statement afterwards, manual entries separately
        notLike(tables.transactions.hash, 'sms:%'),
        notLike(tables.transactions.hash, 'manual:%')
      )
    )

  return rows.map((row) => ({
    accountId,
    date: row.date,
    type: row.type,
    amount: parseFloat(String(row.amount)),
    description: row.description,
  }))
}

/**
 * Insert raw transactions into the database
 * Returns IDs of inserted transactions for categorization step
 */
export async function insertRawTransactions(
  transactions: RawPdfTransaction[],
  context: {
    statementId: string
    accountId: string
    profileId: string
    userId: string
    currency: string
  }
): Promise<InsertResult> {
  const { statementId, accountId, profileId, userId, currency } = context
  const now = dbType === 'postgres' ? new Date() : new Date().toISOString()

  logger.debug(`[InsertTransactions] Inserting ${transactions.length} transactions`)

  const insertedIds: string[] = []

  // Skip rows already imported from an earlier statement that overlaps this one
  const existing = await findExistingTransactions(accountId, statementId, transactions)
  const keyed = transactions.map((txn, position) => ({ txn, position }))
  const { toInsert, skipped } = selectRowsToInsert(keyed, existing, ({ txn }) => ({
    accountId,
    date: txn.date,
    type: txn.type,
    amount: txn.amount,
    description: txn.description,
  }))
  let skippedCount = skipped

  // All chunks go in one transaction so a failed import never leaves a partial set of rows.
  // Rows whose hash already exists for the account are skipped by the conflict clause;
  // any other error propagates and fails the import.
  await db.transaction(async (tx) => {
    for (let i = 0; i < toInsert.length; i += INSERT_BATCH_SIZE) {
      const batch = toInsert.slice(i, i + INSERT_BATCH_SIZE)

      // summary=null indicates the transaction hasn't been categorized yet
      const rows = batch.map(({ txn, position }) => ({
        accountId,
        statementId,
        profileId,
        userId,
        date: txn.date,
        type: txn.type,
        amount: txn.amount.toString(),
        currency,
        balance: txn.balance != null ? txn.balance.toString() : null,
        originalDescription: txn.description,
        merchantFingerprint: merchantFingerprint(txn.description),
        summary: null,
        category: 'other', // Default, will be updated by categorization
        categoryConfidence: null,
        hash: generateTransactionHash(accountId, txn.date, txn.amount, txn.description, position),
        createdAt: now as Date,
        updatedAt: now as Date,
      }))

      const inserted = await tx
        .insert(tables.transactions)
        .values(rows)
        .onConflictDoNothing({
          target: [tables.transactions.accountId, tables.transactions.hash],
        })
        .returning({ id: tables.transactions.id })

      insertedIds.push(...inserted.map((row) => row.id))
      skippedCount += rows.length - inserted.length
    }
  })

  invalidateDuplicateCache(userId)

  logger.debug(
    `[InsertTransactions] Inserted ${insertedIds.length} transactions, skipped ${skippedCount} duplicates`
  )

  // Match the new lines with transactions already imported from bank message alerts
  let mergedWithBankMessages = 0
  let possibleMatches = 0
  try {
    const reconciled = await reconcileWithCounts(userId, [accountId])
    mergedWithBankMessages = reconciled.matched
    possibleMatches = reconciled.possible
  } catch (error) {
    logger.error('[InsertTransactions] Matching with SMS transactions failed:', error)
  }

  return {
    insertedCount: insertedIds.length,
    skippedDuplicates: skippedCount,
    transactionIds: insertedIds,
    mergedWithBankMessages,
    possibleMatches,
  }
}
