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

/**
 * Match unverified SMS and hand-entered transactions with statement lines (all accounts, or the
 * given ones). Returns how many were matched and how many more look like a match but need the
 * user to confirm.
 */
export async function reconcileWithCounts(
  userId: string,
  accountIds?: string[]
): Promise<{ matched: number; possible: number }> {
  if (accountIds && accountIds.length === 0) return { matched: 0, possible: 0 }

  const pairings = pairAll(await loadPools(userId, { accountIds }))
  let matchedCount = 0
  let possibleCount = 0
  for (const { kind, matched, possible } of pairings) {
    for (const { sms, target } of matched) {
      await mergeDuplicates(userId, target.id, [sms.id])
    }
    if (matched.length > 0) {
      logger.info(`[SmsImport] Matched ${matched.length} ${kind} transactions against statements`)
    }
    matchedCount += matched.length
    possibleCount += possible.length
  }
  return { matched: matchedCount, possible: possibleCount }
}

/** Match unverified SMS and hand-entered transactions with statement lines. Returns how many matched. */
export async function reconcileSmsTransactions(
  userId: string,
  accountIds?: string[]
): Promise<number> {
  return (await reconcileWithCounts(userId, accountIds)).matched
}
