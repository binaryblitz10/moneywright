/**
 * Learning backfill service
 *
 * Fills the columns the learning features read (merchant fingerprint, category and name source)
 * for transactions that existed before those columns did. Runs at startup and is idempotent:
 * only rows still missing a value are touched, except when the fingerprint rules change.
 */

import { and, asc, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm'
import { db, tables, dbType } from '../db'
import { logger } from '../lib/logger'
import { FINGERPRINT_VERSION, merchantFingerprint } from '../lib/merchant-fingerprint'
import type { LabelSource } from '../lib/constants'

const BATCH_SIZE = 500
const VERSION_KEY = 'merchant_fingerprint_version'

async function getStoredVersion(): Promise<number | null> {
  const [row] = await db
    .select({ value: tables.appConfig.value })
    .from(tables.appConfig)
    .where(eq(tables.appConfig.key, VERSION_KEY))
    .limit(1)
  return row ? Number(row.value) : null
}

async function saveVersion(): Promise<void> {
  const now = (dbType === 'postgres' ? new Date() : new Date().toISOString()) as Date
  const value = String(FINGERPRINT_VERSION)
  await db
    .insert(tables.appConfig)
    .values({ key: VERSION_KEY, value, isEncrypted: '0', createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: tables.appConfig.key, set: { value, updatedAt: now } })
}

/**
 * Compute fingerprints in batches. A transaction with nothing to identify gets '' so it counts as
 * computed. With `all`, every row is recomputed (walking by id) instead of only the empty ones.
 */
async function backfillFingerprints(all: boolean): Promise<number> {
  let done = 0
  let cursor = ''
  for (;;) {
    const rows = await db
      .select({ id: tables.transactions.id, description: tables.transactions.originalDescription })
      .from(tables.transactions)
      .where(
        all ? gt(tables.transactions.id, cursor) : isNull(tables.transactions.merchantFingerprint)
      )
      .orderBy(asc(tables.transactions.id))
      .limit(BATCH_SIZE)
    if (rows.length === 0) break

    await db.transaction(async (tx) => {
      for (const row of rows) {
        await tx
          .update(tables.transactions)
          .set({ merchantFingerprint: merchantFingerprint(row.description) })
          .where(eq(tables.transactions.id, row.id))
      }
    })
    done += rows.length
    cursor = rows[rows.length - 1]!.id
  }
  return done
}

/** Set category_source and name_source where still empty, from what the row already records */
async function backfillSources(): Promise<number> {
  const t = tables.transactions
  let updated = 0
  for (const column of ['categorySource', 'nameSource'] as const) {
    const steps: Array<[LabelSource, ReturnType<typeof and>]> = [
      ['user', eq(t.isManuallyCategorized, true)],
      ['rule', sql`${t.categoryConfidence} = 1`],
      ['ai', isNotNull(t.summary)],
    ]
    for (const [source, condition] of steps) {
      const result = await db
        .update(t)
        .set({ [column]: source })
        .where(and(isNull(t[column]), condition))
        .returning({ id: t.id })
      updated += result.length
    }
  }
  return updated
}

/** Fill the learning columns of existing transactions. Safe to run on every startup. */
export async function backfillLearningColumns(): Promise<void> {
  const versionChanged = (await getStoredVersion()) !== FINGERPRINT_VERSION
  // A fresh install has no stored version and no rows, so recomputing everything costs nothing
  const fingerprints = await backfillFingerprints(versionChanged)
  if (versionChanged) await saveVersion()
  const sources = await backfillSources()

  if (fingerprints + sources > 0) {
    logger.info(
      `[Startup] Learning backfill: ${fingerprints} fingerprints, ${sources} sources filled`
    )
  }
}
