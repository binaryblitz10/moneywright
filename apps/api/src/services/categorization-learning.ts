/**
 * What the categorizer has learned from the user: the memory of past decisions per merchant and
 * the recent corrections of the AI. Both are read once per categorization run.
 */

import { and, desc, eq, inArray, isNotNull, ne, or, type SQL } from 'drizzle-orm'
import { db, tables } from '../db'
import type { LabelSource } from '../lib/constants'
import { MANUAL_DOCUMENT_TYPE } from '../lib/manual-statement'
import {
  buildMemory,
  resolveFromMemory,
  topCategory,
  type MemoryEntry,
} from '../lib/categorization-memory'
import { accuracyRate, timestampMs } from '../lib/learned-notes'
import type { CorrectionEvent } from '../lib/categorization-examples'

const DEFAULT_CORRECTION_LIMIT = 40

/**
 * Memory of the user's categorized transactions, keyed `${fingerprint}|${type}`.
 * Transactions reset by a recategorize (summary null) and hidden ones are left out.
 */
export async function loadMemory(userId: string): Promise<Map<string, MemoryEntry>> {
  const rows = await db
    .select({
      fingerprint: tables.transactions.merchantFingerprint,
      type: tables.transactions.type,
      category: tables.transactions.category,
      name: tables.transactions.summary,
      isSubscription: tables.transactions.isSubscription,
      categorySource: tables.transactions.categorySource,
      nameSource: tables.transactions.nameSource,
      confidence: tables.transactions.categoryConfidence,
      date: tables.transactions.date,
      updatedAt: tables.transactions.updatedAt,
      description: tables.transactions.originalDescription,
    })
    .from(tables.transactions)
    .where(
      and(
        eq(tables.transactions.userId, userId),
        isNotNull(tables.transactions.merchantFingerprint),
        ne(tables.transactions.merchantFingerprint, ''),
        isNotNull(tables.transactions.summary),
        eq(tables.transactions.isHidden, false)
      )
    )

  return buildMemory(
    rows.map((r) => ({
      fingerprint: r.fingerprint ?? '',
      type: r.type,
      category: r.category ?? 'other',
      name: r.name,
      isSubscription: !!r.isSubscription,
      categorySource: r.categorySource as LabelSource | null,
      nameSource: r.nameSource as LabelSource | null,
      confidence: r.confidence === null ? null : Number(r.confidence),
      date: r.date,
      updatedAt: r.updatedAt ?? r.date,
      description: r.description ?? '',
    })),
    new Date().toISOString().slice(0, 10)
  )
}

/** The newest times the user changed a category the AI or memory had chosen */
export async function loadRecentCorrections(
  userId: string,
  limit: number = DEFAULT_CORRECTION_LIMIT
): Promise<CorrectionEvent[]> {
  return db
    .select({
      merchantFingerprint: tables.categorizationEvents.merchantFingerprint,
      description: tables.categorizationEvents.description,
      fromValue: tables.categorizationEvents.fromValue,
      toValue: tables.categorizationEvents.toValue,
    })
    .from(tables.categorizationEvents)
    .where(
      and(
        eq(tables.categorizationEvents.userId, userId),
        eq(tables.categorizationEvents.action, 'correct'),
        eq(tables.categorizationEvents.field, 'category'),
        inArray(tables.categorizationEvents.fromSource, ['ai', 'memory'])
      )
    )
    .orderBy(desc(tables.categorizationEvents.createdAt))
    .limit(limit)
}

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_MERCHANT_RESULTS = 20

export interface LearningStats {
  /** Merchants the memory can categorize without asking the AI */
  merchantsLearned: number
  /** What categorized the transactions of the most recent completed statement */
  lastImport: {
    statementId: string
    filename: string
    categorizedBy: { rule: number; memory: number; ai: number; user: number }
  } | null
  /** Share of AI/memory categories the user left alone; null when there is too little to judge */
  accuracy: { last30: number | null; last90: number | null }
  corrections30: number
  totalCorrections: number
}

export interface LearnedMerchant {
  fingerprint: string
  name: string | null
  category: string | null
  rowCount: number
}

/** How many AI/memory categories were changed by the user, and how many still stand */
function windowAccuracy(
  days: number,
  now: number,
  correctionTimes: number[],
  uncorrectedTimes: number[]
): number | null {
  const since = now - days * DAY_MS
  return accuracyRate(
    correctionTimes.filter((t) => t >= since).length,
    uncorrectedTimes.filter((t) => t >= since).length
  )
}

/** The numbers shown under Settings > AI learning */
export async function getLearningStats(userId: string, profileId?: string): Promise<LearningStats> {
  const txScope = profileId
    ? and(eq(tables.transactions.userId, userId), eq(tables.transactions.profileId, profileId))
    : eq(tables.transactions.userId, userId)
  const eventScope = (...extra: SQL[]): SQL | undefined =>
    and(
      eq(tables.categorizationEvents.userId, userId),
      profileId ? eq(tables.categorizationEvents.profileId, profileId) : undefined,
      ...extra
    )

  const memory = await loadMemory(userId)
  const merchantsLearned = [...memory.values()].filter((e) => resolveFromMemory(e) !== null).length

  const [lastStatement] = await db
    .select({ id: tables.statements.id, filename: tables.statements.originalFilename })
    .from(tables.statements)
    .where(
      and(
        eq(tables.statements.userId, userId),
        profileId ? eq(tables.statements.profileId, profileId) : undefined,
        eq(tables.statements.status, 'completed'),
        ne(tables.statements.documentType, MANUAL_DOCUMENT_TYPE),
        // Skip statements whose rows were all already imported: they have nothing to report
        inArray(
          tables.statements.id,
          db
            .selectDistinct({ id: tables.transactions.statementId })
            .from(tables.transactions)
            .where(eq(tables.transactions.userId, userId))
        )
      )
    )
    .orderBy(desc(tables.statements.createdAt))
    .limit(1)

  let lastImport: LearningStats['lastImport'] = null
  if (lastStatement) {
    const sources = await db
      .select({ source: tables.transactions.categorySource })
      .from(tables.transactions)
      .where(eq(tables.transactions.statementId, lastStatement.id))
    const categorizedBy = { rule: 0, memory: 0, ai: 0, user: 0 }
    for (const { source } of sources) {
      if (source && source in categorizedBy) categorizedBy[source as LabelSource] += 1
    }
    lastImport = { statementId: lastStatement.id, filename: lastStatement.filename, categorizedBy }
  }

  const corrections = await db
    .select({ createdAt: tables.categorizationEvents.createdAt })
    .from(tables.categorizationEvents)
    .where(
      eventScope(
        eq(tables.categorizationEvents.action, 'correct'),
        eq(tables.categorizationEvents.field, 'category'),
        inArray(tables.categorizationEvents.fromSource, ['ai', 'memory'])
      )
    )
  const standing = await db
    .select({ createdAt: tables.transactions.createdAt })
    .from(tables.transactions)
    .where(and(txScope, inArray(tables.transactions.categorySource, ['ai', 'memory'])))

  const now = Date.now()
  const correctionTimes = corrections.map((r) => timestampMs(r.createdAt) ?? 0)
  const standingTimes = standing.map((r) => timestampMs(r.createdAt) ?? 0)

  return {
    merchantsLearned,
    lastImport,
    accuracy: {
      last30: windowAccuracy(30, now, correctionTimes, standingTimes),
      last90: windowAccuracy(90, now, correctionTimes, standingTimes),
    },
    corrections30: correctionTimes.filter((t) => t >= now - 30 * DAY_MS).length,
    totalCorrections: correctionTimes.length,
  }
}

/** Merchants in the memory whose fingerprint or name contains the query */
export async function searchLearnedMerchants(
  userId: string,
  query: string
): Promise<LearnedMerchant[]> {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  const byFingerprint = new Map<string, MemoryEntry[]>()
  for (const entry of (await loadMemory(userId)).values()) {
    const matches =
      entry.fingerprint.toLowerCase().includes(needle) ||
      (entry.name?.toLowerCase().includes(needle) ?? false)
    if (matches)
      byFingerprint.set(entry.fingerprint, [...(byFingerprint.get(entry.fingerprint) ?? []), entry])
  }

  return [...byFingerprint.entries()]
    .map(([fingerprint, entries]) => {
      const rowCount = entries.reduce(
        (sum, e) => sum + [...e.rowCounts.values()].reduce((a, b) => a + b, 0),
        0
      )
      const main = entries.reduce((a, b) => (b.totalWeight > a.totalWeight ? b : a))
      return {
        fingerprint,
        name: main.name,
        category: topCategory(main)?.category ?? null,
        rowCount,
      }
    })
    .sort((a, b) => b.rowCount - a.rowCount)
    .slice(0, MAX_MERCHANT_RESULTS)
}

/**
 * Stop treating a merchant's rows as confirmed by the user: category and name set by the user
 * go back to 'ai', and the merchant's correction history is dropped. Returns the rows changed.
 */
export async function forgetMerchant(userId: string, fingerprint: string): Promise<number> {
  const mine = and(
    eq(tables.transactions.userId, userId),
    eq(tables.transactions.merchantFingerprint, fingerprint)
  )

  return db.transaction(async (tx) => {
    const touched = await tx
      .select({ id: tables.transactions.id })
      .from(tables.transactions)
      .where(
        and(
          mine,
          or(
            eq(tables.transactions.categorySource, 'user'),
            eq(tables.transactions.nameSource, 'user')
          )
        )
      )
    await tx
      .update(tables.transactions)
      .set({ categorySource: 'ai' })
      .where(and(mine, eq(tables.transactions.categorySource, 'user')))
    await tx
      .update(tables.transactions)
      .set({ nameSource: 'ai' })
      .where(and(mine, eq(tables.transactions.nameSource, 'user')))
    await tx
      .delete(tables.categorizationEvents)
      .where(
        and(
          eq(tables.categorizationEvents.userId, userId),
          eq(tables.categorizationEvents.merchantFingerprint, fingerprint)
        )
      )
    return touched.length
  })
}
