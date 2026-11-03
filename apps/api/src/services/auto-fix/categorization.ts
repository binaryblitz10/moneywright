/**
 * Fixers that run the categorizer again: on rows an import left uncategorized, and on rows it
 * was unsure about, now that rules and memory may know more.
 */

import { and, asc, eq, inArray, isNull, isNotNull, lt, or, sql } from 'drizzle-orm'
import { db, dbType, tables } from '../../db'
import type { Transaction } from '../../db'
import { categorizeStatements } from '../../lib/pdf'
import { logger } from '../../lib/logger'
import { LOW_CONFIDENCE_BELOW } from '../transactions'
import { TRANSACTION_COLUMNS, loadTransactions, trackTransactions, transactionLabel } from './rows'
import { makeFixId } from './values'
import type { Fix, FixContext, Fixer } from './types'

interface StatementData {
  statementId: string
  /** The rows the fix is about */
  transactionIds: string[]
}

/**
 * Statements (finished importing, so rows without a name are not just waiting their turn) with
 * the ids of their transactions that match `rowFilter`, oldest statement first.
 */
async function groupByStatement(
  ctx: FixContext,
  rowFilter: ReturnType<typeof and>
): Promise<Map<string, { filename: string; ids: string[] }>> {
  const rows = await db
    .select({
      id: tables.transactions.id,
      statementId: tables.transactions.statementId,
      filename: tables.statements.originalFilename,
    })
    .from(tables.transactions)
    .innerJoin(tables.statements, eq(tables.statements.id, tables.transactions.statementId))
    .where(
      and(
        eq(tables.transactions.userId, ctx.userId),
        ctx.profileId ? eq(tables.transactions.profileId, ctx.profileId) : undefined,
        eq(tables.transactions.isHidden, false),
        eq(tables.statements.status, 'completed'),
        rowFilter
      )
    )
    .orderBy(asc(tables.statements.createdAt), asc(tables.transactions.date))

  const groups = new Map<string, { filename: string; ids: string[] }>()
  for (const row of rows) {
    const group = groups.get(row.statementId) ?? { filename: row.filename, ids: [] }
    group.ids.push(row.id)
    groups.set(row.statementId, group)
  }
  return groups
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

const STUCK_ID = 'stuck-uncategorized'

export const stuckUncategorized: Fixer = {
  id: STUCK_ID,
  label: 'Categorize transactions that were skipped',
  safe: false,
  usesAi: true,
  async find(ctx) {
    const groups = await groupByStatement(ctx, isNull(tables.transactions.summary))
    return [...groups].map<Fix>(([statementId, group]) => ({
      id: makeFixId(STUCK_ID, [statementId]),
      fixer: STUCK_ID,
      description: `Categorize ${plural(group.ids.length, 'transaction')} in ${group.filename}`,
      entityIds: [statementId],
      data: { statementId, transactionIds: group.ids } satisfies StatementData,
    }))
  },
  async apply(ctx, fix) {
    const { statementId, transactionIds } = fix.data as StatementData
    return trackTransactions(
      ctx.userId,
      transactionIds,
      async () => {
        await categorizeStatements(
          [statementId],
          ctx.countryCode,
          ctx.model,
          undefined,
          ctx.profileId
        )
      },
      (before, after) =>
        `Categorized ${transactionLabel(before)}${after ? ` as ${after.category}` : ''}`
    )
  },
}

const RECHECK_ID = 'recheck-low-confidence'

/** The model's confidence in a row's category; rows with none count as zero */
function confidenceOf(row: Transaction): number {
  return row.categoryConfidence === null ? 0 : Number(row.categoryConfidence)
}

/** A new answer replaces the old one only when it is a different category the model is surer of */
function isBetter(now: Transaction, was: Transaction): boolean {
  return now.category !== was.category && confidenceOf(now) > confidenceOf(was)
}

export const recheckLowConfidence: Fixer = {
  id: RECHECK_ID,
  label: 'Re-check uncertain categories',
  safe: false,
  usesAi: true,
  async find(ctx) {
    const groups = await groupByStatement(
      ctx,
      and(
        isNotNull(tables.transactions.summary),
        eq(tables.transactions.isManuallyCategorized, false),
        isNull(tables.transactions.linkedEntityId),
        // Categories the user or a rule chose are not the AI's to second-guess
        or(
          isNull(tables.transactions.categorySource),
          inArray(tables.transactions.categorySource, ['ai', 'memory'])
        ),
        or(
          eq(tables.transactions.category, 'other'),
          lt(sql`coalesce(${tables.transactions.categoryConfidence}, 1)`, LOW_CONFIDENCE_BELOW)
        )
      )
    )
    return [...groups].map<Fix>(([statementId, group]) => ({
      id: makeFixId(RECHECK_ID, [statementId]),
      fixer: RECHECK_ID,
      description: `Re-check ${plural(group.ids.length, 'uncertain category')} in ${group.filename}`,
      entityIds: [statementId],
      data: { statementId, transactionIds: group.ids } satisfies StatementData,
    }))
  },
  async apply(ctx, fix) {
    const { statementId, transactionIds } = fix.data as StatementData
    const snapshot = await loadTransactions(ctx.userId, transactionIds)
    const now = (dbType === 'postgres' ? new Date() : new Date().toISOString()) as Date

    /** Put a row back as it was */
    const restore = (row: Transaction) =>
      db
        .update(tables.transactions)
        .set({
          ...(Object.fromEntries(
            TRANSACTION_COLUMNS.map((column) => [column, row[column]])
          ) as Partial<Transaction>),
          updatedAt: now,
        })
        .where(eq(tables.transactions.id, row.id))

    // Rows still waiting for a name in this statement are categorized by the same run
    const waiting = await db
      .select({ id: tables.transactions.id })
      .from(tables.transactions)
      .where(
        and(eq(tables.transactions.statementId, statementId), isNull(tables.transactions.summary))
      )

    return trackTransactions(
      ctx.userId,
      [...new Set([...transactionIds, ...waiting.map((row) => row.id)])],
      async () => {
        // Reset the way recategorizing does, so the categorizer treats the rows as new
        await db
          .update(tables.transactions)
          .set({
            summary: null,
            category: 'other',
            categoryConfidence: null,
            categorySource: null,
            nameSource: null,
            isSubscription: false,
            updatedAt: now,
          })
          .where(inArray(tables.transactions.id, transactionIds))
        try {
          await categorizeStatements(
            [statementId],
            ctx.countryCode,
            ctx.model,
            undefined,
            ctx.profileId
          )
        } catch (error) {
          logger.error('[AutoFix] Re-check failed, putting the rows back:', error)
          for (const row of snapshot.values()) await restore(row)
          throw error
        }
        const results = await loadTransactions(ctx.userId, transactionIds)
        for (const [id, was] of snapshot) {
          const result = results.get(id)
          if (!result || !isBetter(result, was)) await restore(was)
        }
      },
      (before, after) =>
        after && before.category !== after.category
          ? `Re-checked ${transactionLabel(before)}: ${before.category} to ${after.category}`
          : `Categorized ${transactionLabel(before)}`
    )
  },
}
