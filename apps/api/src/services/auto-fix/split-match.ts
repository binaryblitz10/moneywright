/**
 * Merge a hand-entered (or bank message) foreign purchase into the statement line of the purchase
 * when the statement splits it into the purchase and its markup and tax lines that add up to the
 * entered amount.
 */

import { findSplitMatches, type SplitRow } from '../../lib/split-match'
import { mergeDuplicates } from '../duplicates'
import { getDismissedSmsMatches } from '../preferences'
import { loadPools } from '../sms-matching'
import type { Transaction } from '../../db'
import { trackTransactions, transactionLabel } from './rows'
import { makeFixId } from './values'
import type { Fix, Fixer } from './types'

const ID = 'split-match'

interface SplitData {
  provisionalId: string
  mainId: string
}

function toSplitRow(row: Transaction): SplitRow {
  return {
    id: row.id,
    accountId: row.accountId,
    date: row.date,
    type: row.type,
    amount: Number(row.amount),
    description: row.originalDescription,
  }
}

export const splitMatch: Fixer = {
  id: ID,
  label: 'Match purchases the statement split into fees',
  hint: 'A purchase you entered includes the forex markup and tax, which the statement lists as separate lines that add up to your amount. Your entry is merged into the purchase line; the fee lines stay.',
  safe: true,
  usesAi: false,
  async find(ctx) {
    const pools = await loadPools(ctx.userId, { profileId: ctx.profileId })
    const provisional = [...pools.smsRows, ...pools.manualRows]
    if (provisional.length === 0) return []

    const dismissed = new Set(await getDismissedSmsMatches(ctx.userId))
    const matches = findSplitMatches(
      provisional.map(toSplitRow),
      pools.candidates.map(toSplitRow),
      (provisionalId, mainId) => dismissed.has(`${provisionalId}|${mainId}`)
    )

    const byId = new Map([...provisional, ...pools.candidates].map((row) => [row.id, row]))
    return matches.map<Fix>((match) => {
      const entered = byId.get(match.provisionalId)!
      return {
        id: makeFixId(ID, [match.provisionalId, match.mainId, ...match.feeIds]),
        fixer: ID,
        description: `Match ${transactionLabel(entered)} with its statement purchase and ${match.feeIds.length} fee ${match.feeIds.length === 1 ? 'line' : 'lines'}`,
        entityIds: [match.provisionalId, match.mainId, ...match.feeIds],
        data: { provisionalId: match.provisionalId, mainId: match.mainId } satisfies SplitData,
      }
    })
  },
  async apply(ctx, fix) {
    const { provisionalId, mainId } = fix.data as SplitData
    return trackTransactions(
      ctx.userId,
      [provisionalId, mainId],
      async () => {
        await mergeDuplicates(ctx.userId, mainId, [provisionalId])
      },
      (before, after) =>
        after?.duplicateOfId
          ? `Merged ${transactionLabel(before)} into its statement purchase; the fees stay as their own lines`
          : `Kept ${transactionLabel(before)} as the purchase line`
    )
  },
}
