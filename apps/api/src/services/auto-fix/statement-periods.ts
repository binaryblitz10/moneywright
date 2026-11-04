/**
 * Write the period dates the data health checks inferred for statements stored without them.
 */

import { and, eq } from 'drizzle-orm'
import { db, dbType, tables } from '../../db'
import { healthFor } from './health'
import { asRecord } from './rows'
import { changedColumns, makeFixId } from './values'
import type { Fix, Fixer } from './types'

const ID = 'statement-periods'

interface PeriodData {
  statementId: string
  periodStart: string
  periodEnd: string
}

export const statementPeriods: Fixer = {
  id: ID,
  label: 'Fill in missing statement dates',
  hint: 'Statements with no start or end date get them from their transactions.',
  safe: true,
  usesAi: false,
  async find(ctx) {
    const health = await healthFor(ctx)
    return health.accounts.flatMap((account) =>
      account.missingPeriod.flatMap<Fix>((statement) =>
        statement.periodStart && statement.periodEnd
          ? [
              {
                id: makeFixId(ID, [statement.statementId]),
                fixer: ID,
                description: `Set ${statement.filename} to ${statement.periodStart} - ${statement.periodEnd}`,
                entityIds: [statement.statementId],
                data: {
                  statementId: statement.statementId,
                  periodStart: statement.periodStart,
                  periodEnd: statement.periodEnd,
                } satisfies PeriodData,
              },
            ]
          : []
      )
    )
  },
  async apply(ctx, fix) {
    const { statementId, periodStart, periodEnd } = fix.data as PeriodData
    const where = and(
      eq(tables.statements.id, statementId),
      eq(tables.statements.userId, ctx.userId)
    )
    const [before] = await db
      .select({
        periodStart: tables.statements.periodStart,
        periodEnd: tables.statements.periodEnd,
        filename: tables.statements.originalFilename,
      })
      .from(tables.statements)
      .where(where)
    // Only fill gaps: dates the user has since set are left alone
    if (!before || (before.periodStart && before.periodEnd)) return []

    const after = {
      periodStart: before.periodStart ?? periodStart,
      periodEnd: before.periodEnd ?? periodEnd,
    }
    await db
      .update(tables.statements)
      .set({
        ...after,
        updatedAt: (dbType === 'postgres' ? new Date() : new Date().toISOString()) as Date,
      })
      .where(where)

    const changed = changedColumns(asRecord(before), after, ['periodStart', 'periodEnd'])
    return changed
      ? [
          {
            entityType: 'statement',
            entityId: statementId,
            ...changed,
            description: `Set the dates of ${before.filename} to ${after.periodStart} - ${after.periodEnd}`,
          },
        ]
      : []
  },
}
