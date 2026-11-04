/**
 * Merge groups of duplicate transactions: proven copies automatically, probable ones on request.
 */

import { findDuplicateGroups, mergeDuplicates } from '../duplicates'
import { transactionLabel, trackTransactions } from './rows'
import { makeFixId } from './values'
import type { Fix, Fixer } from './types'

interface MergeData {
  keeperId: string
  copyIds: string[]
}

function duplicatesFixer(options: {
  id: string
  label: string
  hint: string
  safe: boolean
  tier: 'sure' | 'likely'
}): Fixer {
  const { id, tier } = options
  return {
    id,
    label: options.label,
    hint: options.hint,
    safe: options.safe,
    usesAi: false,
    async find(ctx) {
      const groups = await findDuplicateGroups(ctx.userId, { profileId: ctx.profileId })
      return groups
        .filter((group) => group.tier === tier)
        .map<Fix>((group) => {
          const keeper = group.transactions.find((txn) => txn.id === group.suggestedKeeperId)!
          const copyIds = group.transactions
            .map((txn) => txn.id)
            .filter((txnId) => txnId !== keeper.id)
            .sort()
          return {
            id: makeFixId(id, [keeper.id, ...copyIds]),
            fixer: id,
            description: `Merge ${copyIds.length + 1} copies of ${keeper.originalDescription.slice(0, 60)} ${keeper.currency} ${keeper.amount.toFixed(2)} on ${keeper.date}`,
            entityIds: [keeper.id, ...copyIds],
            data: { keeperId: keeper.id, copyIds } satisfies MergeData,
          }
        })
    },
    async apply(ctx, fix) {
      const { keeperId, copyIds } = fix.data as MergeData
      return trackTransactions(
        ctx.userId,
        fix.entityIds,
        async () => {
          await mergeDuplicates(ctx.userId, keeperId, copyIds)
        },
        (before) =>
          before.id === keeperId
            ? `Kept ${transactionLabel(before)} as the main copy`
            : `Merged duplicate: ${transactionLabel(before)}`
      )
    },
  }
}

export const duplicatesSure = duplicatesFixer({
  id: 'duplicates-sure',
  label: 'Merge duplicate transactions',
  hint: 'The same transaction was imported more than once. The extra copies are merged into one.',
  safe: true,
  tier: 'sure',
})

export const duplicatesLikely = duplicatesFixer({
  id: 'duplicates-likely',
  label: 'Merge probable duplicates',
  hint: 'Lines that look like the same transaction but could not be matched exactly. The extra copies are merged into one.',
  safe: false,
  tier: 'likely',
})
