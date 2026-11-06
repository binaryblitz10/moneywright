/**
 * Auto-fix: finds problems the app can repair on its own, repairs them, and keeps a record of every
 * change so it can be undone. Safe fixers run after an import; the others wait for the user.
 */

import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { db, dbType, tables } from '../../db'
import { logger } from '../../lib/logger'
import { invalidateDuplicateCache } from '../duplicates'
import { getStatementById, type StatementResponse } from '../statements'
import { toTransactionResponse, type TransactionResponse } from '../transactions'
import { bankMessageRef } from './bank-message-ref'
import { brokenLinks, cardPaymentUnique, transferPairs } from './card-links'
import { recheckLowConfidence, stuckUncategorized } from './categorization'
import { duplicatesLikely, duplicatesSure } from './duplicates'
import { loadTransactions } from './rows'
import { statementPeriods } from './statement-periods'
import { columnValue, valuesMatch } from './values'
import type { ChangeEntityType, ChangeRecord, Fix, FixContext, Fixer } from './types'

export type { FixContext } from './types'

/** In the order they run: each may rely on the fixes before it */
const FIXERS: Fixer[] = [
  statementPeriods,
  duplicatesSure,
  bankMessageRef,
  brokenLinks,
  cardPaymentUnique,
  stuckUncategorized,
  recheckLowConfidence,
  duplicatesLikely,
  transferPairs,
]

export interface FixPreview {
  fixer: string
  label: string
  hint: string
  safe: boolean
  usesAi: boolean
  count: number
  items: Array<{ id: string; description: string }>
}

export interface ApplyOptions {
  /** Only these fixers; all when omitted */
  fixerIds?: string[]
  /** Only these fixes (ids from the preview); all found when omitted */
  fixIds?: string[]
  /** Leave out the fixers that wait for the user */
  safeOnly?: boolean
  trigger: 'import' | 'manual'
  /** The statements an import just added, kept on the batch */
  statementIds?: string[]
}

export interface ApplyResult {
  /** Null when nothing changed */
  batchId: string | null
  count: number
  byFixer: Record<string, number>
}

/** What each fixer would fix right now */
export async function previewFixes(ctx: FixContext): Promise<FixPreview[]> {
  const pass = { ...ctx }
  return Promise.all(
    FIXERS.map(async (fixer) => {
      const fixes = await fixer.find(pass).catch((error) => {
        logger.error(`[AutoFix] Finding ${fixer.id} failed:`, error)
        return [] as Fix[]
      })
      return {
        fixer: fixer.id,
        label: fixer.label,
        hint: fixer.hint,
        safe: fixer.safe,
        usesAi: fixer.usesAi,
        count: fixes.length,
        items: fixes.map((fix) => ({ id: fix.id, description: fix.description })),
      }
    })
  )
}

function dbTime(date: Date): Date {
  return (dbType === 'postgres' ? date : date.toISOString()) as Date
}

/**
 * Apply fixes and record them as one batch. Each fixer finds its fixes again just before applying
 * them, so an earlier fixer's changes are seen. A fix that fails is logged and skipped.
 */
export async function applyFixes(ctx: FixContext, options: ApplyOptions): Promise<ApplyResult> {
  const applied: Array<{ fixer: string; records: ChangeRecord[] }> = []
  const byFixer: Record<string, number> = {}

  for (const fixer of FIXERS) {
    if (options.fixerIds && !options.fixerIds.includes(fixer.id)) continue
    if (options.safeOnly && !fixer.safe) continue

    const pass = { ...ctx }
    let fixes: Fix[]
    try {
      fixes = await fixer.find(pass)
    } catch (error) {
      logger.error(`[AutoFix] Finding ${fixer.id} failed:`, error)
      continue
    }
    for (const fix of fixes) {
      if (options.fixIds && !options.fixIds.includes(fix.id)) continue
      try {
        const records = await fixer.apply(pass, fix)
        if (records.length === 0) continue
        applied.push({ fixer: fixer.id, records })
        byFixer[fixer.id] = (byFixer[fixer.id] ?? 0) + 1
      } catch (error) {
        logger.error(`[AutoFix] Applying ${fix.id} failed:`, error)
      }
    }
  }

  const count = applied.length
  if (count === 0) return { batchId: null, count: 0, byFixer }

  // Changes get increasing times so undo can replay them backwards in the order they were made
  const base = Date.now()
  const batchId = await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(tables.autoFixBatches)
      .values({
        userId: ctx.userId,
        profileId: ctx.profileId ?? null,
        trigger: options.trigger,
        statementIds: JSON.stringify(options.statementIds ?? []),
        summary: JSON.stringify(byFixer),
        createdAt: dbTime(new Date(base)),
      })
      .returning({ id: tables.autoFixBatches.id })
    const rows = applied.flatMap(({ fixer, records }) =>
      records.map((record) => ({ fixer, record }))
    )
    for (let i = 0; i < rows.length; i += 200) {
      await tx.insert(tables.autoFixChanges).values(
        rows.slice(i, i + 200).map(({ fixer, record }, offset) => ({
          batchId: batch!.id,
          fixer,
          entityType: record.entityType,
          entityId: record.entityId,
          description: record.description,
          before: JSON.stringify(record.before),
          after: JSON.stringify(record.after),
          createdAt: dbTime(new Date(base + i + offset)),
        }))
      )
    }
    return batch!.id
  })

  invalidateDuplicateCache(ctx.userId)
  logger.info(`[AutoFix] Applied ${count} fixes (${options.trigger})`)
  return { batchId, count, byFixer }
}

// ============================================================================
// UNDO
// ============================================================================

/**
 * The tables changes are recorded for. They all have `id`, `userId` and `updatedAt`, so one set of
 * queries serves them; the cast only lets the column helpers accept any of the three.
 */
const ENTITY_TABLES: Record<ChangeEntityType, typeof tables.transactions> = {
  transaction: tables.transactions,
  statement: tables.statements as unknown as typeof tables.transactions,
  sms_message: tables.smsMessages as unknown as typeof tables.transactions,
}

type ChangeRow = typeof tables.autoFixChanges.$inferSelect

function parseRecord(text: string): Record<string, unknown> | null {
  return JSON.parse(text) as Record<string, unknown> | null
}

/** Put one recorded change back. False when the row was changed since and is left alone. */
async function undoOne(userId: string, change: ChangeRow): Promise<boolean> {
  const table = ENTITY_TABLES[change.entityType as ChangeEntityType]
  const before = parseRecord(change.before)
  const after = parseRecord(change.after)
  if (!table || !before) return false
  const postgres = dbType === 'postgres'
  const restored = Object.fromEntries(
    Object.entries(before).map(([column, value]) => [column, columnValue(column, value, postgres)])
  )

  const [current] = await db
    .select()
    .from(table)
    .where(and(eq(table.id, change.entityId), eq(table.userId, userId)))
  if (after === null) {
    // A deleted row comes back only if nothing has taken its place
    if (current) return false
    await db.insert(table).values(restored as typeof table.$inferInsert)
    return true
  }
  if (!current || !valuesMatch(current as Record<string, unknown>, after)) return false

  await db
    .update(table)
    .set({ ...restored, updatedAt: dbTime(new Date()) } as Partial<typeof table.$inferInsert>)
    .where(eq(table.id, change.entityId))
  return true
}

export interface UndoResult {
  undone: number
  skipped: number
}

/** Undo changes, last made first; mark those undone, and the batch when every change is */
async function undoChanges(userId: string, batchId: string, only?: string): Promise<UndoResult> {
  const changes = await db
    .select()
    .from(tables.autoFixChanges)
    .where(
      and(
        eq(tables.autoFixChanges.batchId, batchId),
        only ? eq(tables.autoFixChanges.id, only) : undefined
      )
    )
    .orderBy(desc(tables.autoFixChanges.createdAt))

  const result: UndoResult = { undone: 0, skipped: 0 }
  const undoneIds: string[] = []
  for (const change of changes) {
    if (change.undoneAt) continue
    let done = false
    try {
      done = await undoOne(userId, change)
    } catch (error) {
      logger.error(`[AutoFix] Undoing change ${change.id} failed:`, error)
    }
    if (done) undoneIds.push(change.id)
    else result.skipped++
  }
  result.undone = undoneIds.length

  const now = dbTime(new Date())
  if (undoneIds.length > 0) {
    await db
      .update(tables.autoFixChanges)
      .set({ undoneAt: now })
      .where(inArray(tables.autoFixChanges.id, undoneIds))
    const remaining = await db
      .select({ id: tables.autoFixChanges.id, undoneAt: tables.autoFixChanges.undoneAt })
      .from(tables.autoFixChanges)
      .where(eq(tables.autoFixChanges.batchId, batchId))
    if (remaining.every((change) => change.undoneAt || undoneIds.includes(change.id))) {
      await db
        .update(tables.autoFixBatches)
        .set({ undoneAt: now })
        .where(eq(tables.autoFixBatches.id, batchId))
    }
  }
  invalidateDuplicateCache(userId)
  return result
}

/**
 * Undo a whole batch, last change first. A change is skipped (and the batch stays partly undone)
 * when its row was edited since the fix; null when the batch is not found.
 */
export async function undoBatch(userId: string, batchId: string): Promise<UndoResult | null> {
  const [batch] = await db
    .select({ id: tables.autoFixBatches.id })
    .from(tables.autoFixBatches)
    .where(and(eq(tables.autoFixBatches.id, batchId), eq(tables.autoFixBatches.userId, userId)))
  return batch ? undoChanges(userId, batch.id) : null
}

/** Undo one change of a batch; null when it is not found */
export async function undoChange(userId: string, changeId: string): Promise<UndoResult | null> {
  const [found] = await db
    .select({ batchId: tables.autoFixChanges.batchId })
    .from(tables.autoFixChanges)
    .innerJoin(tables.autoFixBatches, eq(tables.autoFixBatches.id, tables.autoFixChanges.batchId))
    .where(and(eq(tables.autoFixChanges.id, changeId), eq(tables.autoFixBatches.userId, userId)))
  return found ? undoChanges(userId, found.batchId, changeId) : null
}

/** The fixers whose change on a row is a merge into another transaction */
const MERGE_FIXER_IDS = [duplicatesSure.id, duplicatesLikely.id, bankMessageRef.id]

/**
 * A merged copy was brought back by hand (Unmerge in History): mark the auto-fix changes that
 * merged it as undone too, so the log does not still show the merge as in effect.
 */
export async function markMergeUndone(userId: string, copyId: string): Promise<void> {
  const changes = await db
    .select({ id: tables.autoFixChanges.id, batchId: tables.autoFixChanges.batchId })
    .from(tables.autoFixChanges)
    .innerJoin(tables.autoFixBatches, eq(tables.autoFixBatches.id, tables.autoFixChanges.batchId))
    .where(
      and(
        eq(tables.autoFixBatches.userId, userId),
        eq(tables.autoFixChanges.entityType, 'transaction'),
        eq(tables.autoFixChanges.entityId, copyId),
        inArray(tables.autoFixChanges.fixer, MERGE_FIXER_IDS),
        isNull(tables.autoFixChanges.undoneAt)
      )
    )
  if (changes.length === 0) return

  const now = dbTime(new Date())
  await db
    .update(tables.autoFixChanges)
    .set({ undoneAt: now })
    .where(
      inArray(
        tables.autoFixChanges.id,
        changes.map((change) => change.id)
      )
    )
  for (const batchId of new Set(changes.map((change) => change.batchId))) {
    const open = await db
      .select({ id: tables.autoFixChanges.id })
      .from(tables.autoFixChanges)
      .where(
        and(eq(tables.autoFixChanges.batchId, batchId), isNull(tables.autoFixChanges.undoneAt))
      )
      .limit(1)
    if (open.length === 0) {
      await db
        .update(tables.autoFixBatches)
        .set({ undoneAt: now })
        .where(eq(tables.autoFixBatches.id, batchId))
    }
  }
}

// ============================================================================
// HISTORY
// ============================================================================

export interface BatchResponse {
  id: string
  profileId: string | null
  trigger: 'import' | 'manual'
  statementIds: string[]
  /** Fixes applied per fixer */
  summary: Record<string, number>
  createdAt: string
  undoneAt: string | null
  changes: Array<{
    id: string
    fixer: string
    entityType: ChangeEntityType
    entityId: string
    description: string
    undoneAt: string | null
    /** The changed columns before and after the fix */
    before: Record<string, unknown> | null
    after: Record<string, unknown> | null
    /** The transaction as it is now, for transaction changes (null when it no longer exists) */
    transaction: TransactionResponse | null
    /** The statement as it is now, for statement changes (null when it no longer exists) */
    statement: StatementResponse | null
  }>
}

function isoOrNull(value: string | Date | null): string | null {
  return value === null ? null : new Date(value).toISOString()
}

/** The latest batches, newest first, each with its changes in the order they were made */
export async function listBatches(
  userId: string,
  profileId?: string,
  limit = 20
): Promise<BatchResponse[]> {
  const batches = await db
    .select()
    .from(tables.autoFixBatches)
    .where(
      and(
        eq(tables.autoFixBatches.userId, userId),
        profileId ? eq(tables.autoFixBatches.profileId, profileId) : undefined
      )
    )
    .orderBy(desc(tables.autoFixBatches.createdAt))
    .limit(limit)
  if (batches.length === 0) return []

  const changes = await db
    .select()
    .from(tables.autoFixChanges)
    .where(
      inArray(
        tables.autoFixChanges.batchId,
        batches.map((batch) => batch.id)
      )
    )
    .orderBy(tables.autoFixChanges.createdAt)

  const transactions = await loadTransactions(
    userId,
    changes.filter((change) => change.entityType === 'transaction').map((change) => change.entityId)
  )

  const statements = new Map<string, StatementResponse>()
  for (const id of new Set(
    changes.filter((change) => change.entityType === 'statement').map((change) => change.entityId)
  )) {
    const statement = await getStatementById(id, userId)
    if (statement) statements.set(id, statement)
  }

  return batches.map((batch) => ({
    id: batch.id,
    profileId: batch.profileId,
    trigger: batch.trigger as BatchResponse['trigger'],
    statementIds: JSON.parse(batch.statementIds) as string[],
    summary: JSON.parse(batch.summary) as Record<string, number>,
    createdAt: new Date(batch.createdAt).toISOString(),
    undoneAt: isoOrNull(batch.undoneAt),
    changes: changes
      .filter((change) => change.batchId === batch.id)
      .map((change) => ({
        id: change.id,
        fixer: change.fixer,
        entityType: change.entityType as ChangeEntityType,
        entityId: change.entityId,
        description: change.description,
        undoneAt: isoOrNull(change.undoneAt),
        before: parseRecord(change.before),
        after: parseRecord(change.after),
        transaction:
          change.entityType === 'transaction' && transactions.has(change.entityId)
            ? toTransactionResponse(transactions.get(change.entityId)!)
            : null,
        statement:
          change.entityType === 'statement' ? (statements.get(change.entityId) ?? null) : null,
      })),
  }))
}
