/**
 * Batch insert transactions extracted from PDF
 * Handles deduplication via hash and bulk inserts
 */

import { createHash } from 'crypto'
import { and, eq, gte, lte, ne, notLike } from 'drizzle-orm'
import { db, tables, dbType } from '../../db'
import { logger } from '../logger'
import { duplicateKey, selectRowsToInsert } from '../duplicate-key'
import { reconcileSmsTransactions } from '../../services/sms-matching'
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

/**
 * Count the account's existing transactions from other statements per duplicate key,
 * limited to the date range of the incoming rows. Hidden transactions count: they still exist.
 */
async function countExistingByKey(
  accountId: string,
  statementId: string,
  transactions: RawPdfTransaction[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (transactions.length === 0) return counts

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
        gte(tables.transactions.date, minDate),
        lte(tables.transactions.date, maxDate),
        // Transactions from bank SMS alerts are matched with the statement afterwards
        notLike(tables.transactions.hash, 'sms:%')
      )
    )

  for (const row of rows) {
    const key = duplicateKey({
      accountId,
      date: row.date,
      type: row.type,
      amount: parseFloat(String(row.amount)),
      description: row.description,
    })
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
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
  const existingCounts = await countExistingByKey(accountId, statementId, transactions)
  const keyed = transactions.map((txn, position) => ({ txn, position }))
  const { toInsert, skipped } = selectRowsToInsert(keyed, existingCounts, ({ txn }) =>
    duplicateKey({
      accountId,
      date: txn.date,
      type: txn.type,
      amount: txn.amount,
      description: txn.description,
    })
  )
  let skippedCount = skipped

  // Process in batches
  for (let i = 0; i < toInsert.length; i += INSERT_BATCH_SIZE) {
    const batch = toInsert.slice(i, i + INSERT_BATCH_SIZE)

    for (const { txn, position } of batch) {
      const hash = generateTransactionHash(
        accountId,
        txn.date,
        txn.amount,
        txn.description,
        position
      )

      // Check for duplicate
      const [existing] = await db
        .select({ id: tables.transactions.id })
        .from(tables.transactions)
        .where(eq(tables.transactions.hash, hash))
        .limit(1)

      if (existing) {
        skippedCount++
        continue
      }

      try {
        // Insert with null summary - will be set by categorization
        // summary=null indicates transaction hasn't been categorized yet
        const [inserted] = await db
          .insert(tables.transactions)
          .values({
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
            summary: null, // null = not yet categorized
            category: 'other', // Default, will be updated by categorization
            categoryConfidence: null,
            hash,
            createdAt: now as Date,
            updatedAt: now as Date,
          })
          .returning({ id: tables.transactions.id })

        if (inserted) {
          insertedIds.push(inserted.id)
        }
      } catch {
        // Likely a duplicate constraint violation, skip
        logger.debug(
          `[InsertTransactions] Skipped duplicate transaction: ${txn.date} ${txn.amount}`
        )
        skippedCount++
      }
    }
  }

  logger.debug(
    `[InsertTransactions] Inserted ${insertedIds.length} transactions, skipped ${skippedCount} duplicates`
  )

  // Match the new lines with transactions already imported from bank SMS alerts
  try {
    await reconcileSmsTransactions(userId, [accountId])
  } catch (error) {
    logger.error('[InsertTransactions] Matching with SMS transactions failed:', error)
  }

  return {
    insertedCount: insertedIds.length,
    skippedDuplicates: skippedCount,
    transactionIds: insertedIds,
  }
}

/**
 * Update transactions with categorization results
 */
export async function updateTransactionCategories(
  categorizations: Array<{
    id: string
    category: string
    confidence: number
    summary: string
  }>
): Promise<void> {
  const now = dbType === 'postgres' ? new Date() : new Date().toISOString()

  logger.debug(`[InsertTransactions] Updating ${categorizations.length} transaction categories`)

  for (const cat of categorizations) {
    try {
      await db
        .update(tables.transactions)
        .set({
          category: cat.category,
          categoryConfidence: cat.confidence.toString(),
          summary: cat.summary,
          updatedAt: now as Date,
        })
        .where(eq(tables.transactions.id, cat.id))
    } catch (error) {
      logger.warn(`[InsertTransactions] Failed to update category for ${cat.id}:`, error)
    }
  }

  logger.debug(`[InsertTransactions] Category updates complete`)
}
