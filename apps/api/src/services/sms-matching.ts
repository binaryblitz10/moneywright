/**
 * Matching of transactions imported from bank message alerts with the lines of an uploaded statement.
 *
 * The same routine runs after anything is imported, SMS or statement, so it does not matter which
 * came first. A confirmed match keeps the statement line (its text is the full one), marks it
 * verified and removes the SMS transaction; pairs that only agree on date and amount are offered
 * to the user as possible matches instead.
 */

import { and, eq, gte, inArray, like, lte, notLike } from 'drizzle-orm'
import { db, tables, dbType } from '../db'
import type { Transaction } from '../db'
import { logger } from '../lib/logger'
import { pairTransactions } from '../lib/sms/pair'
import { NAME_VERSION } from '../lib/pdf/transaction-names'
import {
  bulkDeleteTransactions,
  toTransactionResponse,
  type TransactionResponse,
} from './transactions'
import { dismissSmsMatch, getDismissedSmsMatches } from './preferences'

export interface PossibleMatch {
  sms: TransactionResponse
  candidates: TransactionResponse[]
}

interface Pools {
  smsRows: Transaction[]
  candidates: Transaction[]
}

/**
 * Unverified SMS transactions and the statement lines they could belong to: same account, in the
 * dates the SMS transactions cover. Hand-entered rows and already verified rows are not candidates.
 */
async function loadPools(
  userId: string,
  scope: { accountIds?: string[]; profileId?: string }
): Promise<Pools> {
  const smsRows = await db
    .select()
    .from(tables.transactions)
    .where(
      and(
        eq(tables.transactions.userId, userId),
        like(tables.transactions.hash, 'sms:%'),
        scope.accountIds ? inArray(tables.transactions.accountId, scope.accountIds) : undefined,
        scope.profileId ? eq(tables.transactions.profileId, scope.profileId) : undefined
      )
    )
  if (smsRows.length === 0) return { smsRows, candidates: [] }

  const dates = smsRows.map((row) => row.date).sort()
  const accountIds = [...new Set(smsRows.map((row) => row.accountId))]
  const candidates = await db
    .select()
    .from(tables.transactions)
    .where(
      and(
        eq(tables.transactions.userId, userId),
        inArray(tables.transactions.accountId, accountIds),
        gte(tables.transactions.date, dates[0]!),
        lte(tables.transactions.date, dates[dates.length - 1]!),
        notLike(tables.transactions.hash, 'sms:%'),
        notLike(tables.transactions.hash, 'manual:%'),
        eq(tables.transactions.smsVerified, false)
      )
    )
  return { smsRows, candidates }
}

/**
 * Settle an SMS transaction against its statement line: the statement line is marked verified and
 * keeps what the user set by hand on the SMS transaction (category, name, hidden), the message
 * record points at the statement line, and the SMS transaction is removed.
 */
async function mergeSmsTransaction(userId: string, sms: Transaction, target: Transaction) {
  const now = (dbType === 'postgres' ? new Date() : new Date().toISOString()) as Date
  const update: Partial<Transaction> = { smsVerified: true, updatedAt: now }

  if (sms.isManuallyCategorized && !target.isManuallyCategorized) {
    update.category = sms.category
    update.summary = sms.summary
    update.nameVersion = NAME_VERSION
    update.categoryConfidence = '1.00' as unknown as Transaction['categoryConfidence']
    update.isManuallyCategorized = true
  }
  if (sms.isHidden && !target.isHidden) update.isHidden = true

  await db.update(tables.transactions).set(update).where(eq(tables.transactions.id, target.id))
  await db
    .update(tables.smsMessages)
    .set({
      status: 'verified',
      transactionId: target.id,
      accountId: target.accountId,
      updatedAt: now,
    })
    .where(and(eq(tables.smsMessages.userId, userId), eq(tables.smsMessages.transactionId, sms.id)))
  await bulkDeleteTransactions([sms.id], userId)
}

/**
 * Match unverified SMS transactions with statement lines (all accounts, or the given ones).
 * Returns how many were verified.
 */
export async function reconcileSmsTransactions(
  userId: string,
  accountIds?: string[]
): Promise<number> {
  if (accountIds && accountIds.length === 0) return 0

  const { smsRows, candidates } = await loadPools(userId, { accountIds })
  const { matched } = pairTransactions(smsRows, candidates)
  for (const { sms, target } of matched) {
    await mergeSmsTransaction(userId, sms, target)
  }
  if (matched.length > 0) {
    logger.info(`[SmsImport] Verified ${matched.length} SMS transactions against statements`)
  }
  return matched.length
}

/**
 * SMS transactions that agree with a statement line on account, date, direction and amount but
 * not on the merchant text, for the user to confirm or reject. Newest first.
 */
export async function findPossibleMatches(
  userId: string,
  profileId?: string
): Promise<PossibleMatch[]> {
  const { smsRows, candidates } = await loadPools(userId, { profileId })
  const dismissed = new Set(await getDismissedSmsMatches(userId))
  const { possible } = pairTransactions(smsRows, candidates, (smsId, targetId) =>
    dismissed.has(`${smsId}|${targetId}`)
  )

  return possible
    .map(({ sms, candidates: options }) => ({
      sms: toTransactionResponse(sms),
      candidates: options.map(toTransactionResponse),
    }))
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
 * The user says an SMS transaction and a statement line are the same purchase.
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
  if (!sms.hash.startsWith('sms:') || target.hash.startsWith('sms:')) return false
  if (sms.accountId !== target.accountId || target.smsVerified) return false

  await mergeSmsTransaction(userId, sms, target)
  return true
}

/** The user says an SMS transaction and a statement line are different purchases */
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
