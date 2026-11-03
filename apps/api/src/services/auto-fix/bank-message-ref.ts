/**
 * Confirm a possible match between a bank message and a statement line when both carry the same
 * reference number: that is the bank's own id for the payment, not a coincidence of date and amount.
 */

import { and, eq, inArray } from 'drizzle-orm'
import { db, tables } from '../../db'
import { decryptOptional } from '../../lib/encryption'
import { references } from '../../lib/duplicate-references'
import { confirmPossibleMatch, findPossibleMatches } from '../sms-matching'
import { asRecord, loadTransactions, trackTransactions, transactionLabel } from './rows'
import { changedColumns, makeFixId } from './values'
import type { ChangeRecord, Fix, Fixer } from './types'

const ID = 'bank-message-ref'
const SMS_COLUMNS = ['status', 'transactionId', 'accountId'] as const

interface MatchData {
  provisionalId: string
  targetId: string
}

/** Message records (with the original text while they still hold it) of provisional transactions */
async function loadMessages(userId: string, transactionIds: string[]) {
  if (transactionIds.length === 0) return []
  return db
    .select()
    .from(tables.smsMessages)
    .where(
      and(
        eq(tables.smsMessages.userId, userId),
        inArray(tables.smsMessages.transactionId, transactionIds)
      )
    )
}

export const bankMessageRef: Fixer = {
  id: ID,
  label: 'Match bank messages by reference number',
  safe: true,
  usesAi: false,
  async find(ctx) {
    const matches = (await findPossibleMatches(ctx.userId, ctx.profileId)).filter(
      (match) => match.kind === 'sms'
    )
    const messages = await loadMessages(
      ctx.userId,
      matches.map((match) => match.sms.id)
    )

    const fixes: Fix[] = []
    for (const match of matches) {
      // The text of the message when its record still has it, else the merchant read from it
      const text = [
        ...messages
          .filter((message) => message.transactionId === match.sms.id)
          .map((message) => decryptOptional(message.body)),
        match.sms.originalDescription,
      ].join(' ')
      const refs = new Set(references(text))
      if (refs.size === 0) continue

      const sharing = match.candidates.filter((candidate) =>
        references(candidate.originalDescription).some((ref) => refs.has(ref))
      )
      // A reference that fits two statement lines proves nothing
      if (sharing.length !== 1) continue
      const target = sharing[0]!
      fixes.push({
        id: makeFixId(ID, [match.sms.id, target.id]),
        fixer: ID,
        description: `Match the bank message for ${match.sms.originalDescription.slice(0, 60)} ${match.sms.currency} ${match.sms.amount.toFixed(2)} on ${match.sms.date} with its statement line`,
        entityIds: [match.sms.id, target.id],
        data: { provisionalId: match.sms.id, targetId: target.id } satisfies MatchData,
      })
    }
    return fixes
  },
  async apply(ctx, fix) {
    const { provisionalId, targetId } = fix.data as MatchData
    const [provisional] = [...(await loadTransactions(ctx.userId, [provisionalId])).values()]
    if (!provisional) return []

    const messagesBefore = await loadMessages(ctx.userId, [provisionalId])
    const [statementBefore] = await db
      .select({ deletedTransactionCount: tables.statements.deletedTransactionCount })
      .from(tables.statements)
      .where(eq(tables.statements.id, provisional.statementId))

    const transactionRecords = await trackTransactions(
      ctx.userId,
      [provisionalId, targetId],
      async () => {
        await confirmPossibleMatch(ctx.userId, provisionalId, targetId)
      },
      (before, after) =>
        after
          ? `Marked ${transactionLabel(before)} as verified by its bank message`
          : `Removed the bank message copy of ${transactionLabel(before)}`
    )
    if (transactionRecords.length === 0) return []

    // Undo runs these backwards: the removed transaction must exist again before a message points at it
    const records: ChangeRecord[] = transactionRecords.filter((record) => record.after !== null)
    const messagesAfter = await db
      .select()
      .from(tables.smsMessages)
      .where(
        inArray(
          tables.smsMessages.id,
          messagesBefore.map((message) => message.id)
        )
      )
    for (const was of messagesBefore) {
      const now = messagesAfter.find((message) => message.id === was.id)
      const changed = now && changedColumns(asRecord(was), asRecord(now), SMS_COLUMNS)
      if (changed) {
        records.push({
          entityType: 'sms_message',
          entityId: was.id,
          ...changed,
          description: `Pointed the bank message for ${transactionLabel(provisional)} at its statement line`,
        })
      }
    }
    const [statementAfter] = await db
      .select({ deletedTransactionCount: tables.statements.deletedTransactionCount })
      .from(tables.statements)
      .where(eq(tables.statements.id, provisional.statementId))
    const statementChange =
      statementBefore &&
      statementAfter &&
      changedColumns(statementBefore, statementAfter, ['deletedTransactionCount'])
    if (statementChange) {
      records.push({
        entityType: 'statement',
        entityId: provisional.statementId,
        ...statementChange,
        description: `Counted the removed bank message copy of ${transactionLabel(provisional)}`,
      })
    }
    records.push(...transactionRecords.filter((record) => record.after === null))
    return records
  },
}
