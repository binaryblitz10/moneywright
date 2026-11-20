/**
 * Automatic matching of provisional transactions (imported from bank message alerts, or entered by
 * hand) with the lines of an uploaded statement.
 *
 * The same routine runs after anything is imported, SMS or statement, so it does not matter which
 * came first. A confirmed match keeps the statement line (its text is the full one) and merges the
 * provisional transaction into it, like a merged duplicate, so it can be undone. Pairs that only
 * agree on date and amount are left for the user (see findPossibleMatches).
 */

import { logger } from '../lib/logger'
import { mergeDuplicates } from './duplicates'
import { loadPools, pairAll } from './sms-matching'
import { trackTransactions, transactionLabel } from './auto-fix/rows'
import type { ChangeRecord } from './auto-fix/types'

/**
 * Match unverified SMS and hand-entered transactions with statement lines (all accounts, or the
 * given ones). Returns how many were matched and how many more look like a match but need the
 * user to confirm. With `record`, the merges are also written to History as automatic fixes of
 * those statements, so they can be shown and undone.
 */
export async function reconcileWithCounts(
  userId: string,
  accountIds?: string[],
  record?: { profileId: string; statementIds: string[] }
): Promise<{ matched: number; possible: number }> {
  if (accountIds && accountIds.length === 0) return { matched: 0, possible: 0 }

  const pairings = pairAll(await loadPools(userId, { accountIds }))
  let matchedCount = 0
  let possibleCount = 0
  const records: ChangeRecord[] = []
  for (const { kind, matched, possible } of pairings) {
    for (const { sms, target } of matched) {
      if (!record) {
        await mergeDuplicates(userId, target.id, [sms.id])
        continue
      }
      records.push(
        ...(await trackTransactions(
          userId,
          [sms.id, target.id],
          async () => {
            await mergeDuplicates(userId, target.id, [sms.id])
          },
          (before, after) =>
            after?.duplicateOfId
              ? `Merged the bank message copy of ${transactionLabel(before)} into its statement line`
              : `Marked ${transactionLabel(before)} as verified by its bank message`
        ))
      )
    }
    if (matched.length > 0) {
      logger.info(`[SmsImport] Matched ${matched.length} ${kind} transactions against statements`)
    }
    matchedCount += matched.length
    possibleCount += possible.length
  }
  if (record && records.length > 0) await recordMatches(userId, record, records)
  return { matched: matchedCount, possible: possibleCount }
}

/** Write the merges of an import as one batch; a problem here never fails the import */
async function recordMatches(
  userId: string,
  record: { profileId: string; statementIds: string[] },
  records: ChangeRecord[]
): Promise<void> {
  try {
    // Loaded here: the auto-fix module imports the statement services that import this one
    const { recordBatch } = await import('./auto-fix')
    await recordBatch(
      { userId, profileId: record.profileId },
      [{ fixer: 'bank-message-match', records }],
      {
        trigger: 'import',
        statementIds: record.statementIds,
        summary: { 'bank-message-match': records.length },
      }
    )
  } catch (error) {
    logger.error('[SmsImport] Could not record the matches in History:', error)
  }
}

/** Match unverified SMS and hand-entered transactions with statement lines. Returns how many matched. */
export async function reconcileSmsTransactions(
  userId: string,
  accountIds?: string[]
): Promise<number> {
  return (await reconcileWithCounts(userId, accountIds)).matched
}
