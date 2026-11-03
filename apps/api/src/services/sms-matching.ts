/**
 * Matching of provisional transactions (imported from bank message alerts, or entered by hand) with
 * the lines of an uploaded statement.
 *
 * The same routine runs after anything is imported, SMS or statement, so it does not matter which
 * came first. A confirmed match keeps the statement line (its text is the full one) and removes the
 * provisional transaction; SMS matches also mark the line verified. Pairs that only agree on date
 * and amount are offered to the user as possible matches instead.
 */

import { and, eq, gte, inArray, like, lte, notLike, or } from 'drizzle-orm'
import { db, tables, dbType } from '../db'
import type { Transaction } from '../db'
import { logger } from '../lib/logger'
import { pairManualTransactions, pairTransactions } from '../lib/sms/pair'
import { NAME_VERSION } from '../lib/pdf/transaction-names'
import {
  bulkDeleteTransactions,
  toTransactionResponse,
  type TransactionResponse,
} from './transactions'
import { dismissSmsMatch, getDismissedSmsMatches } from './preferences'

export interface PossibleMatch {
  /** Where the provisional transaction (`sms`) came from */
  kind: 'sms' | 'manual'
  /** The provisional transaction: a bank message or a hand-entered one */
  sms: TransactionResponse
  candidates: TransactionResponse[]
}

interface Pools {
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
 * same account, in the dates they cover. Provisional and already verified rows are not candidates.
 */
async function loadPools(
  userId: string,
  scope: { accountIds?: string[]; profileId?: string }
): Promise<Pools> {
  const provisional = await db
    .select()
    .from(tables.transactions)
    .where(
      and(
        eq(tables.transactions.userId, userId),
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
        eq(tables.transactions.smsVerified, false)
      )
    )
  return { smsRows, manualRows, candidates }
}

/**
 * Settle a provisional transaction against its statement line: the statement line keeps what the
 * user set by hand on the provisional one (category, name, notes, hidden), the message records point at
 * the statement line, and the provisional transaction is removed. SMS matches also mark the line
 * verified; a hand-entered transaction is the user's own word, so its category and name always count.
 */
async function mergeProvisionalTransaction(
  userId: string,
  provisional: Transaction,
  target: Transaction
) {
  const now = (dbType === 'postgres' ? new Date() : new Date().toISOString()) as Date
  const manual = isManualRow(provisional)
  const update: Partial<Transaction> = { updatedAt: now }
  if (!manual) update.smsVerified = true

  if (provisional.isManuallyCategorized && !target.isManuallyCategorized) {
    update.category = provisional.category
    update.summary = provisional.summary
    update.nameVersion = NAME_VERSION
    update.categoryConfidence = '1.00' as unknown as Transaction['categoryConfidence']
    update.categorySource = provisional.categorySource
    update.nameSource = provisional.nameSource
    update.isManuallyCategorized = true
  }
  if (provisional.isHidden && !target.isHidden) update.isHidden = true
  if (provisional.notes && !target.notes) update.notes = provisional.notes

  await db.update(tables.transactions).set(update).where(eq(tables.transactions.id, target.id))
  await db
    .update(tables.smsMessages)
    .set({
      status: 'verified',
      transactionId: target.id,
      accountId: target.accountId,
      updatedAt: now,
    })
    .where(
      and(
        eq(tables.smsMessages.userId, userId),
        eq(tables.smsMessages.transactionId, provisional.id)
      )
    )
  await bulkDeleteTransactions([provisional.id], userId)
}

interface Pairing {
  kind: 'sms' | 'manual'
  matched: Array<{ sms: Transaction; target: Transaction }>
  possible: Array<{ sms: Transaction; candidates: Transaction[] }>
}

/** Pair both kinds of provisional transaction; a statement line settles only one of them */
function pairAll(
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
      await mergeProvisionalTransaction(userId, sms, target)
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

/**
 * SMS and hand-entered transactions that agree with a statement line on account, direction and
 * amount (and date) but not clearly on the text, for the user to confirm or reject. Newest first.
 */
export async function findPossibleMatches(
  userId: string,
  profileId?: string
): Promise<PossibleMatch[]> {
  const pools = await loadPools(userId, { profileId })
  const dismissed = new Set(await getDismissedSmsMatches(userId))
  const pairings = pairAll(pools, (provisionalId, targetId) =>
    dismissed.has(`${provisionalId}|${targetId}`)
  )

  return pairings
    .flatMap(({ kind, possible }) =>
      possible.map(({ sms, candidates: options }) => ({
        kind,
        sms: toTransactionResponse(sms),
        candidates: options.map(toTransactionResponse),
      }))
    )
    .sort((a, b) => b.sms.date.localeCompare(a.sms.date))
}

export async function countPossibleMatches(userId: string, profileId?: string): Promise<number> {
  return (await findPossibleMatches(userId, profileId)).length
}

async function getOwned(userId: string, id: string): Promise<Transaction | null> {
  const [row] = await db
    .select()
    .from(tables.transactions)
    .where(and(eq(tables.transactions.id, id), eq(tables.transactions.userId, userId)))
    .limit(1)
  return row ?? null
}

/**
 * The user says an SMS or hand-entered transaction and a statement line are the same purchase.
 * Returns false when either is missing or they cannot be paired.
 */
export async function confirmPossibleMatch(
  userId: string,
  smsTransactionId: string,
  transactionId: string
): Promise<boolean> {
  const sms = await getOwned(userId, smsTransactionId)
  const target = await getOwned(userId, transactionId)
  if (!sms || !target) return false
  const provisionalHash = /^(sms|manual):/
  if (!provisionalHash.test(sms.hash) || provisionalHash.test(target.hash)) return false
  if (sms.accountId !== target.accountId || target.smsVerified) return false

  await mergeProvisionalTransaction(userId, sms, target)
  return true
}

/** The user says an SMS or hand-entered transaction and a statement line are different purchases */
export async function rejectPossibleMatch(
  userId: string,
  smsTransactionId: string,
  transactionId: string
): Promise<boolean> {
  const sms = await getOwned(userId, smsTransactionId)
  const target = await getOwned(userId, transactionId)
  if (!sms || !target) return false
  await dismissSmsMatch(userId, smsTransactionId, transactionId)
  return true
}
