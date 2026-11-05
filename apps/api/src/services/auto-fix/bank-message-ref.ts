/**
 * Confirm a possible match between a bank message and a statement line when both carry the same
 * reference number: that is the bank's own id for the payment, not a coincidence of date and amount.
 */

import { and, eq, inArray } from 'drizzle-orm'
import { db, tables } from '../../db'
import { decryptOptional } from '../../lib/encryption'
import { references } from '../../lib/duplicate-references'
import { findPossibleMatches } from '../sms-matching'
import { mergeDuplicates } from '../duplicates'
import { trackTransactions, transactionLabel } from './rows'
import { makeFixId } from './values'
import type { Fix, Fixer } from './types'

const ID = 'bank-message-ref'

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
  hint: 'A bank SMS and a statement line share the same reference number, so they are the same transaction.',
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
    return trackTransactions(
      ctx.userId,
      [provisionalId, targetId],
      async () => {
        await mergeDuplicates(ctx.userId, targetId, [provisionalId])
      },
      (before, after) =>
        after?.duplicateOfId
          ? `Merged the bank message copy of ${transactionLabel(before)} into its statement line`
          : `Marked ${transactionLabel(before)} as verified by its bank message`
    )
  },
}
