/**
 * Card payments service
 *
 * Links credit card bill payments in two steps (rules in lib/card-payment-matching):
 * 1. a bank debit is attached to the card it paid, even before the card statement exists
 * 2. it is paired with the card's "payment received" credit once that shows up
 * Also builds the link suggestions for the edit form and repairs half-broken links.
 */

import { and, desc, eq, gte, inArray, isNull, lte, ne } from 'drizzle-orm'
import { db, tables, dbType } from '../db'
import type { Transaction } from '../db'
import { decryptOptional } from '../lib/encryption'
import { getLast4 } from '../lib/account-number'
import { getInstitutionName, SUPPORTED_COUNTRIES, type CountryCode } from '../lib/constants'
import { MANUAL_DOCUMENT_TYPE } from '../lib/manual-statement'
import { logger } from '../lib/logger'
import {
  CARD_PAYMENT_CATEGORY,
  MAX_DAY_DIFF,
  cardSuggestions,
  debitsToAttach,
  inferCard,
  matchPayments,
  pickBest,
  pointedAtDebits,
  rankPairs,
  topCandidates,
  type CardInfo,
  type CardInference,
  type DebitInfo,
  type PairMatch,
  type PaymentTxn,
} from '../lib/card-payment-matching'
import { getManuallyUnlinked } from './preferences'
import { getTransactionById, toTransactionResponse, type TransactionResponse } from './transactions'

/** Bank account types (can make credit card payments) */
export const BANK_ACCOUNT_TYPES = ['savings_account', 'current_account', 'checking_account']
/** Credit card account type */
export const CREDIT_CARD_TYPE = 'credit_card'

const DAY_MS = 86_400_000

type AccountRow = typeof tables.accounts.$inferSelect

function now(): Date {
  return (dbType === 'postgres' ? new Date() : new Date().toISOString()) as Date
}

function displayName(account: Pick<AccountRow, 'accountName' | 'institution' | 'type'>): string {
  return account.accountName || account.institution || account.type
}

function safeDecrypt(value: string | null): string | null {
  try {
    return decryptOptional(value)
  } catch {
    return null
  }
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10)
}

export function toPaymentTxn(txn: Transaction): PaymentTxn {
  return {
    id: txn.id,
    accountId: txn.accountId,
    date: txn.date,
    type: txn.type as 'credit' | 'debit',
    amount: Number(txn.amount),
    category: txn.category,
    description: [txn.originalDescription, txn.summary].filter(Boolean).join(' '),
    isHidden: !!txn.isHidden,
    linkedEntityId: txn.linkedEntityId,
    linkedEntityType: txn.linkedEntityType,
  }
}

async function getUserCountry(userId: string): Promise<CountryCode> {
  const [user] = await db
    .select({ country: tables.users.country })
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .limit(1)
  const supported = SUPPORTED_COUNTRIES.find((c) => c.code === user?.country)
  return supported?.code ?? 'IN'
}

/** The names an institution goes by in a bank description */
function institutionTerms(country: CountryCode, institution: string | null): string[] {
  if (!institution) return []
  return [...new Set([institution, getInstitutionName(country, institution)])]
}

/** Names each of the user's bank accounts' institution goes by, keyed by account id */
export async function loadInstitutionTerms(userId: string): Promise<Map<string, string[]>> {
  const [accounts, country] = await Promise.all([
    db.select().from(tables.accounts).where(eq(tables.accounts.userId, userId)),
    getUserCountry(userId),
  ])
  return new Map(
    accounts
      .filter((a) => BANK_ACCOUNT_TYPES.includes(a.type))
      .map((a) => [a.id, institutionTerms(country, a.institution)])
  )
}

/** Everything the card rules need about the user's active credit cards */
export async function loadCardInfos(userId: string): Promise<CardInfo[]> {
  const [cards, country] = await Promise.all([
    db
      .select()
      .from(tables.accounts)
      .where(
        and(
          eq(tables.accounts.userId, userId),
          eq(tables.accounts.type, CREDIT_CARD_TYPE),
          eq(tables.accounts.isActive, true)
        )
      ),
    getUserCountry(userId),
  ])
  if (cards.length === 0) return []

  const statements = await db
    .select({
      accountId: tables.statements.accountId,
      closingBalance: tables.statements.closingBalance,
    })
    .from(tables.statements)
    .where(
      and(
        inArray(
          tables.statements.accountId,
          cards.map((c) => c.id)
        ),
        eq(tables.statements.status, 'completed'),
        ne(tables.statements.documentType, MANUAL_DOCUMENT_TYPE)
      )
    )
    .orderBy(desc(tables.statements.periodEnd))
  const latestBalance = new Map<string, number | null>()
  for (const s of statements) {
    if (s.accountId && !latestBalance.has(s.accountId)) {
      latestBalance.set(s.accountId, s.closingBalance === null ? null : Number(s.closingBalance))
    }
  }

  return cards.map((card) => ({
    id: card.id,
    name: displayName(card),
    last4: getLast4(safeDecrypt(card.accountNumber)),
    institutionTerms: institutionTerms(country, card.institution),
    latestBalance: latestBalance.get(card.id) ?? null,
  }))
}

/** What the card rules need to know about a bank debit */
export function toDebitInfo(debit: PaymentTxn, ownInstitutionTerms: string[]): DebitInfo {
  return { description: debit.description, amount: debit.amount, ownInstitutionTerms }
}

async function setLink(
  id: string,
  linkedEntityId: string,
  linkedEntityType: 'credit_card' | 'transaction'
): Promise<void> {
  await db
    .update(tables.transactions)
    .set({ linkedEntityId, linkedEntityType, updatedAt: now() })
    .where(eq(tables.transactions.id, id))
}

export interface AutoLinkResult {
  /** Bank debits paired with a card credit */
  paired: number
  /** Bank debits attached to a card only */
  attached: number
}

/**
 * Link the user's card payments in two steps:
 * 1. pair bank debits (unlinked, or already attached to the same card) with card payment credits
 * 2. attach the debits that found no credit to the card they paid, when it can be told
 */
export async function autoLinkCardPayments(userId: string): Promise<AutoLinkResult> {
  const accounts = await db.select().from(tables.accounts).where(eq(tables.accounts.userId, userId))
  const bankAccounts = accounts.filter((a) => BANK_ACCOUNT_TYPES.includes(a.type))
  const cardIds = accounts.filter((a) => a.type === CREDIT_CARD_TYPE).map((a) => a.id)
  if (bankAccounts.length === 0 || cardIds.length === 0) return { paired: 0, attached: 0 }

  const [debitRows, creditRows, pointerRows, cards, termsByAccount, manuallyUnlinked] =
    await Promise.all([
      db
        .select()
        .from(tables.transactions)
        .where(
          and(
            eq(tables.transactions.userId, userId),
            inArray(
              tables.transactions.accountId,
              bankAccounts.map((a) => a.id)
            ),
            eq(tables.transactions.type, 'debit'),
            eq(tables.transactions.category, CARD_PAYMENT_CATEGORY),
            eq(tables.transactions.isHidden, false)
          )
        ),
      db
        .select()
        .from(tables.transactions)
        .where(
          and(
            eq(tables.transactions.userId, userId),
            inArray(tables.transactions.accountId, cardIds),
            eq(tables.transactions.type, 'credit'),
            eq(tables.transactions.isHidden, false),
            isNull(tables.transactions.linkedEntityId)
          )
        ),
      db
        .select({ id: tables.transactions.id, linkedEntityId: tables.transactions.linkedEntityId })
        .from(tables.transactions)
        .where(
          and(
            eq(tables.transactions.userId, userId),
            eq(tables.transactions.linkedEntityType, 'transaction')
          )
        ),
      loadCardInfos(userId),
      loadInstitutionTerms(userId),
      getManuallyUnlinked(userId),
    ])
  const excluded = new Set(manuallyUnlinked)

  const debits = debitRows.map(toPaymentTxn)
  const credits = creditRows.map(toPaymentTxn)
  const pointedAt = pointedAtDebits(
    pointerRows.map((r) => ({ ...r, linkedEntityType: 'transaction' }))
  )

  const matches = matchPayments(debits, credits, pointedAt, excluded)
  const creditById = new Map(credits.map((c) => [c.id, c]))
  for (const match of matches) {
    const credit = creditById.get(match.creditId)!
    await setLink(match.debitId, credit.accountId, 'credit_card')
    await setLink(match.creditId, match.debitId, 'transaction')
    logger.debug(
      `[EntityLinking] Paired bank debit ${match.debitId} with card credit ${match.creditId} (amount diff ${match.amountDiff.toFixed(2)}, ${match.dayDiff} days apart)`
    )
  }

  const pairedIds = new Set(matches.map((m) => m.debitId))
  let attached = 0
  for (const debit of debitsToAttach(debits, pairedIds, excluded)) {
    const card = inferCard(toDebitInfo(debit, termsByAccount.get(debit.accountId) ?? []), cards)
    if (!card) continue
    await setLink(debit.id, card.accountId, 'credit_card')
    attached++
    logger.debug(
      `[EntityLinking] Attached bank debit ${debit.id} to card ${card.accountId}: ${card.reason}`
    )
  }

  return { paired: matches.length, attached }
}

// ============================================================================
// Suggestions for the edit form
// ============================================================================

export interface TransactionSuggestion {
  kind: 'transaction'
  transaction: TransactionResponse
  accountName: string
  amountDiff: number
  dayDiff: number
  score: number
}

export interface CardSuggestion {
  kind: 'card'
  accountId: string
  accountName: string
  reason: string
}

export type LinkSuggestion = TransactionSuggestion | CardSuggestion

export type LinkState =
  | { kind: 'none' }
  | { kind: 'card'; accountId: string; accountName: string }
  | { kind: 'pair'; transaction: TransactionResponse; accountName: string }

export interface LinkSuggestions {
  linked: LinkState
  /** Top candidates, best first */
  candidates: LinkSuggestion[]
  /** The candidate to offer outright, when one is clearly better than the rest */
  best: LinkSuggestion | null
}

const NO_SUGGESTIONS: LinkSuggestions = { linked: { kind: 'none' }, candidates: [], best: null }

/** Where the transaction stands now: unlinked, attached to a card, or paired with its other side */
async function getLinkState(
  txn: TransactionResponse,
  accountNames: Map<string, string>
): Promise<LinkState> {
  const partnerOf = async (partnerId: string): Promise<LinkState> => {
    const partner = await getTransactionById(partnerId, txn.userId)
    return partner
      ? {
          kind: 'pair',
          transaction: partner,
          accountName: accountNames.get(partner.accountId) ?? '',
        }
      : { kind: 'none' }
  }

  if (txn.linkedEntityType === 'transaction' && txn.linkedEntityId) {
    return partnerOf(txn.linkedEntityId)
  }
  if (txn.type === 'debit') {
    const [credit] = await db
      .select({ id: tables.transactions.id })
      .from(tables.transactions)
      .where(
        and(
          eq(tables.transactions.userId, txn.userId),
          eq(tables.transactions.linkedEntityType, 'transaction'),
          eq(tables.transactions.linkedEntityId, txn.id)
        )
      )
      .limit(1)
    if (credit) return partnerOf(credit.id)
    if (txn.linkedEntityType === 'credit_card' && txn.linkedEntityId) {
      const name = accountNames.get(txn.linkedEntityId)
      return name
        ? { kind: 'card', accountId: txn.linkedEntityId, accountName: name }
        : { kind: 'none' }
    }
  }
  return { kind: 'none' }
}

/**
 * Candidates for linking a card payment: for a bank debit, the card credits that could be
 * its payment line plus the cards it may have paid; for a card credit, the bank debits.
 */
export async function getLinkSuggestions(
  transactionId: string,
  userId: string
): Promise<LinkSuggestions> {
  const txn = await getTransactionById(transactionId, userId)
  if (!txn) throw new Error('Transaction not found')

  const accounts = await db.select().from(tables.accounts).where(eq(tables.accounts.userId, userId))
  const accountById = new Map(accounts.map((a) => [a.id, a]))
  const accountNames = new Map(accounts.map((a) => [a.id, displayName(a)]))
  const source = accountById.get(txn.accountId)
  const isDebit =
    txn.type === 'debit' &&
    txn.category === CARD_PAYMENT_CATEGORY &&
    !!source &&
    BANK_ACCOUNT_TYPES.includes(source.type)
  const isCardCredit = txn.type === 'credit' && source?.type === CREDIT_CARD_TYPE
  if (!isDebit && !isCardCredit) return NO_SUGGESTIONS

  const linked = await getLinkState(txn, accountNames)
  if (linked.kind === 'pair') return { linked, candidates: [], best: null }

  const from = addDays(txn.date, -MAX_DAY_DIFF)
  const to = addDays(txn.date, MAX_DAY_DIFF)
  const sameWindow = [
    eq(tables.transactions.userId, userId),
    eq(tables.transactions.isHidden, false),
    gte(tables.transactions.date, from),
    lte(tables.transactions.date, to),
  ]
  const otherAccountIds = accounts
    .filter((a) => (isDebit ? a.type === CREDIT_CARD_TYPE : BANK_ACCOUNT_TYPES.includes(a.type)))
    .map((a) => a.id)
  if (otherAccountIds.length === 0) return { linked, candidates: [], best: null }

  const rows = await db
    .select()
    .from(tables.transactions)
    .where(
      and(
        ...sameWindow,
        inArray(tables.transactions.accountId, otherAccountIds),
        eq(tables.transactions.type, isDebit ? 'credit' : 'debit'),
        isDebit ? undefined : eq(tables.transactions.category, CARD_PAYMENT_CATEGORY)
      )
    )
  const pointers = isDebit
    ? new Set<string>()
    : pointedAtDebits(
        (
          await db
            .select({ linkedEntityId: tables.transactions.linkedEntityId })
            .from(tables.transactions)
            .where(
              and(
                eq(tables.transactions.userId, userId),
                eq(tables.transactions.linkedEntityType, 'transaction'),
                inArray(
                  tables.transactions.linkedEntityId,
                  rows.length > 0 ? rows.map((r) => r.id) : ['']
                )
              )
            )
        ).map((r) => ({ ...r, linkedEntityType: 'transaction' }))
      )

  const self: PaymentTxn = {
    id: txn.id,
    accountId: txn.accountId,
    date: txn.date,
    type: txn.type,
    amount: txn.amount,
    category: txn.category,
    description: [txn.originalDescription, txn.summary].filter(Boolean).join(' '),
    isHidden: txn.isHidden,
    linkedEntityId: txn.linkedEntityId,
    linkedEntityType: txn.linkedEntityType,
  }
  const others = rows.map(toPaymentTxn)
  const ranked: PairMatch[] = isDebit
    ? rankPairs([self], others, pointers)
    : rankPairs(others, [self], pointers)

  const rowById = new Map(rows.map((r) => [r.id, r]))
  const toSuggestion = (pair: PairMatch): TransactionSuggestion => {
    const row = rowById.get(isDebit ? pair.creditId : pair.debitId)!
    return {
      kind: 'transaction',
      transaction: toTransactionResponse(row),
      accountName: accountNames.get(row.accountId) ?? '',
      amountDiff: pair.amountDiff,
      dayDiff: pair.dayDiff,
      score: pair.score,
    }
  }

  const top = topCandidates(ranked)
  const bestPair = pickBest(ranked)
  const transactionSuggestions = top.map(toSuggestion)
  let best: LinkSuggestion | null = bestPair
    ? (transactionSuggestions.find(
        (s) => s.transaction.id === (isDebit ? bestPair.creditId : bestPair.debitId)
      ) ?? null)
    : null

  let cardSuggestionList: CardSuggestion[] = []
  if (isDebit && source) {
    const country = await getUserCountry(userId)
    const cards = await loadCardInfos(userId)
    cardSuggestionList = cardSuggestions(
      toDebitInfo(self, institutionTerms(country, source.institution)),
      cards
    )
      .filter((c: CardInference) => linked.kind !== 'card' || c.accountId !== linked.accountId)
      .map((c) => ({ kind: 'card' as const, ...c }))
    if (!best && transactionSuggestions.length === 0 && cardSuggestionList.length === 1) {
      best = cardSuggestionList[0]!
    }
  }

  return { linked, candidates: [...transactionSuggestions, ...cardSuggestionList], best }
}

// ============================================================================
// Startup repair
// ============================================================================

export interface RepairResult {
  /** Card credits whose bank debit now points back at the card */
  restored: number
  /** Card credits whose link was dropped because its debit is gone or linked elsewhere */
  cleared: number
}

/**
 * One-time (and idempotent) repair of card credits pointing at a bank debit that no longer
 * points back. It never creates new links: auto-linking runs after uploads and recategorizing.
 */
export async function repairCardPaymentLinks(): Promise<RepairResult> {
  const result: RepairResult = { restored: 0, cleared: 0 }

  const cardCredits = await db
    .select({
      id: tables.transactions.id,
      accountId: tables.transactions.accountId,
      userId: tables.transactions.userId,
      target: tables.transactions.linkedEntityId,
    })
    .from(tables.transactions)
    .innerJoin(tables.accounts, eq(tables.accounts.id, tables.transactions.accountId))
    .where(
      and(
        eq(tables.accounts.type, CREDIT_CARD_TYPE),
        eq(tables.transactions.linkedEntityType, 'transaction')
      )
    )

  const targetIds = [...new Set(cardCredits.flatMap((c) => (c.target ? [c.target] : [])))]
  const targets = new Map<string, Transaction>()
  for (let i = 0; i < targetIds.length; i += 500) {
    const rows = await db
      .select()
      .from(tables.transactions)
      .where(inArray(tables.transactions.id, targetIds.slice(i, i + 500)))
    for (const row of rows) targets.set(row.id, row)
  }

  for (const credit of cardCredits) {
    const target = credit.target ? targets.get(credit.target) : undefined
    const pointsBack =
      target &&
      ((target.linkedEntityType === 'credit_card' && target.linkedEntityId === credit.accountId) ||
        (target.linkedEntityType === 'transaction' && target.linkedEntityId === credit.id))
    if (pointsBack) continue

    if (target && target.type === 'debit' && !target.linkedEntityId) {
      await setLink(target.id, credit.accountId, 'credit_card')
      target.linkedEntityId = credit.accountId
      target.linkedEntityType = 'credit_card'
      result.restored++
    } else {
      await db
        .update(tables.transactions)
        .set({ linkedEntityId: null, linkedEntityType: null, updatedAt: now() })
        .where(eq(tables.transactions.id, credit.id))
      result.cleared++
    }
  }

  return result
}
