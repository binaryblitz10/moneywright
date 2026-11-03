/**
 * Categorization events: a log of what the user corrected or confirmed, which the learning
 * features read, plus the lookup behind "apply this correction to similar transactions".
 */

import { and, desc, eq, inArray, isNotNull, isNull, ne, or, type SQL } from 'drizzle-orm'
import { db, tables } from '../db'
import type { NewCategorizationEvent } from '../db'
import { logger } from '../lib/logger'

/** Most similar transactions a single lookup returns */
const MAX_SIMILAR_IDS = 500
const SAMPLE_COUNT = 5

/** Labels set by a machine; a user-set label is never overwritten by a bulk correction */
const MACHINE_SOURCES = ['ai', 'memory']

export interface SimilarSample {
  id: string
  date: string
  amount: number
  originalDescription: string
  summary: string | null
  category: string
}

export interface SimilarForCorrection {
  count: number
  ids: string[]
  samples: SimilarSample[]
}

/** Store events. Never throws: a failed log write must not break the edit that caused it. */
export async function recordEvents(events: NewCategorizationEvent[]): Promise<void> {
  if (events.length === 0) return
  try {
    await db.insert(tables.categorizationEvents).values(events)
  } catch (error) {
    logger.error(
      `[CategorizationEvents] Failed to record ${events.length} events: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Other transactions of the same merchant whose label was set by the AI or by memory and differs
 * from the correction just made, so the user can apply the correction to them too.
 * Returns empty when the transaction is not the user's or has no merchant fingerprint.
 */
export async function findSimilarForCorrection(
  userId: string,
  transactionId: string,
  correction: { category?: string; name?: string }
): Promise<SimilarForCorrection> {
  const empty: SimilarForCorrection = { count: 0, ids: [], samples: [] }

  const [source] = await db
    .select({
      merchantFingerprint: tables.transactions.merchantFingerprint,
      type: tables.transactions.type,
    })
    .from(tables.transactions)
    .where(and(eq(tables.transactions.id, transactionId), eq(tables.transactions.userId, userId)))
    .limit(1)
  if (!source?.merchantFingerprint) return empty

  const differing: SQL[] = []
  if (correction.category !== undefined) {
    differing.push(
      and(
        ne(tables.transactions.category, correction.category),
        inArray(tables.transactions.categorySource, MACHINE_SOURCES)
      )!
    )
  }
  if (correction.name !== undefined) {
    differing.push(
      and(
        or(isNull(tables.transactions.summary), ne(tables.transactions.summary, correction.name)),
        inArray(tables.transactions.nameSource, MACHINE_SOURCES)
      )!
    )
  }
  if (differing.length === 0) return empty

  const rows = await db
    .select({
      id: tables.transactions.id,
      date: tables.transactions.date,
      amount: tables.transactions.amount,
      originalDescription: tables.transactions.originalDescription,
      summary: tables.transactions.summary,
      category: tables.transactions.category,
    })
    .from(tables.transactions)
    .where(
      and(
        eq(tables.transactions.userId, userId),
        eq(tables.transactions.merchantFingerprint, source.merchantFingerprint),
        isNotNull(tables.transactions.merchantFingerprint),
        eq(tables.transactions.type, source.type),
        eq(tables.transactions.isHidden, false),
        ne(tables.transactions.id, transactionId),
        or(...differing)
      )
    )
    .orderBy(desc(tables.transactions.date))
    .limit(MAX_SIMILAR_IDS)

  return {
    count: rows.length,
    ids: rows.map((r) => r.id),
    samples: rows.slice(0, SAMPLE_COUNT).map((r) => ({
      id: r.id,
      date: r.date,
      amount: Number(r.amount),
      originalDescription: r.originalDescription,
      summary: r.summary,
      category: r.category,
    })),
  }
}
