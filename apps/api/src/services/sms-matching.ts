/**
 * Matching of provisional transactions (imported from bank message alerts, or entered by hand) with
 * the lines of an uploaded statement.
 *
 * This file finds the pairs; sms-reconcile.ts merges the confirmed ones when anything is imported.
 * Pairs that only agree on date and amount are offered to the user as possible matches instead.
 */

import { and, eq, gte, inArray, isNull, like, lte, notLike, or } from 'drizzle-orm'
import { db, tables } from '../db'
import type { Transaction } from '../db'
import { pairManualTransactions, pairTransactions } from '../lib/sms/pair'
import { toTransactionResponse, type TransactionResponse } from './transactions'
import { getDismissedSmsMatches } from './preferences'

export interface PossibleMatch {
  /** Where the provisional transaction (`sms`) came from */
  kind: 'sms' | 'manual'
  /** The provisional transaction: a bank message or a hand-entered one */
  sms: TransactionResponse
  candidates: TransactionResponse[]
}

export interface Pools {
  smsRows: Transaction[]
  manualRows: Transaction[]
  candidates: Transaction[]
}

function isManualRow(row: Transaction): boolean {
  return row.hash.startsWith('manual:')
}

/** Hand-entered dates may be off by this many days (see pairManualTransactions) */
const MANUAL_WINDOW_DAYS = 2

function shiftDate(date: string, days: number): string {
  const shifted = new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
  return shifted.toISOString().slice(0, 10)
}

/**
 * Provisional transactions (SMS and hand-entered) and the statement lines they could belong to:
 * same account, in the dates they cover. Provisional, already verified and merged-away rows are not
 * candidates, and merged-away provisional rows are not offered again.
 */
export async function loadPools(
  userId: string,
  scope: { accountIds?: string[]; profileId?: string }
): Promise<Pools> {
  const provisional = await db
    .select()
    .from(tables.transactions)
    .where(
      and(
        eq(tables.transactions.userId, userId),
        isNull(tables.transactions.duplicateOfId),
        or(like(tables.transactions.hash, 'sms:%'), like(tables.transactions.hash, 'manual:%')),
        scope.accountIds ? inArray(tables.transactions.accountId, scope.accountIds) : undefined,
        scope.profileId ? eq(tables.transactions.profileId, scope.profileId) : undefined
      )
    )
  const smsRows = provisional.filter((row) => !isManualRow(row))
  const manualRows = provisional.filter(isManualRow)
  if (provisional.length === 0) return { smsRows, manualRows, candidates: [] }

  const dates = provisional.map((row) => row.date).sort()
  const accountIds = [...new Set(provisional.map((row) => row.accountId))]
  const candidates = await db
    .select()
    .from(tables.transactions)
    .where(
      and(
        eq(tables.transactions.userId, userId),
        inArray(tables.transactions.accountId, accountIds),
        gte(tables.transactions.date, shiftDate(dates[0]!, -MANUAL_WINDOW_DAYS)),
        lte(tables.transactions.date, shiftDate(dates[dates.length - 1]!, MANUAL_WINDOW_DAYS)),
        notLike(tables.transactions.hash, 'sms:%'),
        notLike(tables.transactions.hash, 'manual:%'),
        isNull(tables.transactions.duplicateOfId),
        eq(tables.transactions.smsVerified, false)
      )
    )
  return { smsRows, manualRows, candidates }
}

export interface Pairing {
  kind: 'sms' | 'manual'
  matched: Array<{ sms: Transaction; target: Transaction }>
  possible: Array<{ sms: Transaction; candidates: Transaction[] }>
}

/** Pair both kinds of provisional transaction; a statement line settles only one of them */
export function pairAll(
  pools: Pools,
  isDismissed?: (provisionalId: string, targetId: string) => boolean
): Pairing[] {
  const sms = pairTransactions(pools.smsRows, pools.candidates, isDismissed)
  const taken = new Set(sms.matched.map((m) => m.target.id))
  const manual = pairManualTransactions(
    pools.manualRows,
    pools.candidates.filter((t) => !taken.has(t.id)),
    pools.smsRows.filter((row) => !sms.matched.some((m) => m.sms.id === row.id)),
    isDismissed
  )
  return [
    { kind: 'sms', ...sms },
    { kind: 'manual', ...manual },
  ]
}

/**
 * SMS and hand-entered transactions that agree with a statement line on account, direction and
 * amount (and date) but not clearly on the text, for the user to merge or dismiss. Newest first.
 * Pairs the user dismissed are left out, or the only ones returned with `dismissed`.
 */
export async function findPossibleMatches(
  userId: string,
  profileId?: string,
  dismissed = false
): Promise<PossibleMatch[]> {
  const pools = await loadPools(userId, { profileId })
  const dismissedPairs = new Set(await getDismissedSmsMatches(userId))
  const isDismissedPair = (provisionalId: string, targetId: string) =>
    dismissedPairs.has(`${provisionalId}|${targetId}`)
  // Dismissed pairs are never offered by the pairing itself, so ask for all of them and filter here
  const pairings = pairAll(pools, dismissed ? undefined : isDismissedPair)

  return pairings
    .flatMap(({ kind, possible }) =>
      possible
        .map(({ sms, candidates: options }) => ({
          kind,
          sms,
          options: dismissed ? options.filter((t) => isDismissedPair(sms.id, t.id)) : options,
        }))
        .filter(({ options }) => options.length > 0)
        .map(({ kind: matchKind, sms, options }) => ({
          kind: matchKind,
          sms: toTransactionResponse(sms),
          candidates: options.map(toTransactionResponse),
        }))
    )
    .sort((a, b) => b.sms.date.localeCompare(a.sms.date))
}

/** Number of provisional + statement line pairs waiting for review */
export async function countPossibleMatches(userId: string, profileId?: string): Promise<number> {
  const matches = await findPossibleMatches(userId, profileId)
  return matches.reduce((total, match) => total + match.candidates.length, 0)
}
