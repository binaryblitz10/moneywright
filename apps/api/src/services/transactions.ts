import {
  eq,
  and,
  desc,
  asc,
  like,
  or,
  sql,
  gte,
  lte,
  inArray,
  ne,
  notInArray,
  isNull,
  isNotNull,
  type SQL,
} from 'drizzle-orm'
import { db, tables, dbType } from '../db'
import type { Account, Transaction } from '../db'
import { nanoid } from '../lib/id'
import { MANUAL_DOCUMENT_TYPE, MANUAL_STATEMENT_FILENAME } from '../lib/manual-statement'
import { getAccountByIdRaw } from './accounts'
import { logger } from '../lib/logger'
import { getDismissedDuplicates, setManuallyUnlinked } from './preferences'
import { merchantKey, merchantName } from './spending-changes'
import { getSubscriptionOverrides } from './subscription-overrides'
import { NAME_VERSION } from '../lib/pdf/transaction-names'
import { decryptOptional } from '../lib/encryption'
import { duplicateKey } from '../lib/duplicate-key'
import { countPossibleMatches } from './sms-matching'
import { parseAmountSearch, parseSearchTerms, type SearchTerm } from '../lib/amount-search'
import { getCategoryCodesByKind, type CategoryKind } from '../lib/constants'
import { CARD_PAYMENT_CATEGORY, idsToClear } from '../lib/card-payment-matching'

/**
 * Transaction service
 * Handles transaction CRUD and cross-account linking
 */

/**
 * Transaction response type
 */
/**
 * Search condition for one term: description/summary text match, plus an amount match when the
 * term is a number (see parseAmountSearch). A quoted number is only ever an exact amount.
 */
function buildTermCondition(term: SearchTerm) {
  const amountSearch = parseAmountSearch(term)
  const amount = tables.transactions.amount
  if (amountSearch?.kind === 'exact') {
    return sql`ABS(${amount} - ${amountSearch.value}) < 0.005`
  }

  const searchTerm = `%${term.text}%`
  const textMatch = [
    like(tables.transactions.originalDescription, searchTerm),
    like(tables.transactions.summary, searchTerm),
  ]
  if (amountSearch?.kind === 'partial') {
    // Match against the amount written with two decimals, as it is shown
    const amountText =
      dbType === 'postgres' ? sql`CAST(${amount} AS text)` : sql`printf('%.2f', ${amount})`
    textMatch.push(sql`${amountText} LIKE ${`%${amountSearch.text}%`}`)
  } else if (amountSearch?.kind === 'range') {
    textMatch.push(sql`${amount} >= ${amountSearch.min} AND ${amount} < ${amountSearch.max}`)
  }
  if (amountSearch && amountSearch.rounded !== null) {
    textMatch.push(sql`ROUND(${amount}) = ${amountSearch.rounded}`)
  }
  return or(...textMatch)!
}

/**
 * Whitespace-separated terms are searched independently; a transaction must
 * match every term (in any order, in either description or summary). Text in
 * double quotes is one term and must match exactly.
 */
function buildSearchCondition(search: string) {
  const terms = parseSearchTerms(search)
  if (terms.length === 0) return buildTermCondition({ text: search.trim(), quoted: false })
  if (terms.length === 1) return buildTermCondition(terms[0]!)
  return and(...terms.map(buildTermCondition))!
}

export interface TransactionResponse {
  id: string
  accountId: string
  statementId: string
  profileId: string
  userId: string
  date: string
  type: 'credit' | 'debit'
  amount: number
  currency: string
  originalDescription: string
  summary: string | null
  category: string
  categoryConfidence: number | null
  isSubscription: boolean
  linkedEntityId: string | null
  linkedEntityType: string | null // 'transaction' | 'credit_card' | 'insurance' | 'loan'
  isManuallyCategorized: boolean
  isHidden: boolean
  /** Created from a bank SMS alert and not yet matched to a statement line */
  smsSource: boolean
  /** An SMS alert and a statement line were matched to this transaction */
  smsVerified: boolean
  createdAt: string | Date
  updatedAt: string | Date
}

/**
 * Transaction filters
 */
export interface TransactionFilters {
  profileId?: string
  accountId?: string | string[]
  statementId?: string | string[]
  category?: string | string[]
  /** Category kind; unknown codes count as expenses, matching getCategoryKind */
  kind?: CategoryKind
  type?: 'credit' | 'debit'
  startDate?: string
  endDate?: string
  search?: string
  minAmount?: number
  maxAmount?: number
  isSubscription?: boolean
  includeHidden?: boolean // If true, include hidden transactions (default: false)
  onlyHidden?: boolean // If true, show only hidden transactions
  // Review queues (never manually categorized):
  // 'pending' = categorization never completed (no summary),
  // 'other' = categorized but only into the fallback 'other' category,
  // 'low_confidence' = categorized into a real category with low model confidence
  //   (rows still in 'other' or without a summary are in the categorization queue instead),
  // 'all' = pending or other
  reviewStatus?: ReviewStatus
}

export type ReviewStatus = 'pending' | 'other' | 'low_confidence' | 'all'

/** Low-confidence review queue: categorizations the model was unsure of */
const LOW_CONFIDENCE_BELOW = 0.7

/**
 * Rows for the low-confidence queue: categorized, into a category other than the 'other' fallback,
 * with low model confidence. Rows that still need categorization are never in this queue, so the
 * two review queues do not overlap.
 */
export function isLowConfidenceCategory(): SQL {
  return and(
    isNotNull(tables.transactions.summary),
    ne(tables.transactions.category, 'other'),
    sql`${tables.transactions.categoryConfidence} < ${LOW_CONFIDENCE_BELOW}`
  )!
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  page?: number
  limit?: number
  sortBy?: 'date' | 'amount' | 'createdAt'
  sortOrder?: 'asc' | 'desc'
}

/**
 * Transform transaction to response format
 */
export function toTransactionResponse(txn: Transaction): TransactionResponse {
  return {
    id: txn.id,
    accountId: txn.accountId,
    statementId: txn.statementId,
    profileId: txn.profileId,
    userId: txn.userId,
    date: typeof txn.date === 'string' ? txn.date : txn.date,
    type: txn.type as 'credit' | 'debit',
    amount: typeof txn.amount === 'string' ? parseFloat(txn.amount) : Number(txn.amount),
    currency: txn.currency,
    originalDescription: txn.originalDescription,
    summary: txn.summary,
    category: txn.category,
    categoryConfidence: txn.categoryConfidence
      ? typeof txn.categoryConfidence === 'string'
        ? parseFloat(txn.categoryConfidence)
        : Number(txn.categoryConfidence)
      : null,
    isSubscription: txn.isSubscription ?? false,
    linkedEntityId: txn.linkedEntityId,
    linkedEntityType: txn.linkedEntityType,
    isManuallyCategorized: txn.isManuallyCategorized ?? false,
    isHidden: txn.isHidden ?? false,
    smsSource: txn.hash.startsWith('sms:'),
    smsVerified: txn.smsVerified ?? false,
    createdAt: txn.createdAt,
    updatedAt: txn.updatedAt,
  }
}

/**
 * Build the where-conditions shared by transaction listing and duplicate detection
 */
function buildFilterConditions(userId: string, filters?: TransactionFilters) {
  const conditions = [eq(tables.transactions.userId, userId)]

  // Handle hidden transactions filter
  if (filters?.onlyHidden) {
    // Show only hidden transactions
    conditions.push(eq(tables.transactions.isHidden, true))
  } else if (!filters?.includeHidden) {
    // Exclude hidden transactions by default
    conditions.push(eq(tables.transactions.isHidden, false))
  }
  // If includeHidden is true but onlyHidden is false, no filter is applied (show all)

  if (filters?.profileId) {
    conditions.push(eq(tables.transactions.profileId, filters.profileId))
  }

  if (filters?.accountId) {
    const accountIds = Array.isArray(filters.accountId) ? filters.accountId : [filters.accountId]
    if (accountIds.length === 1) {
      conditions.push(eq(tables.transactions.accountId, accountIds[0]!))
    } else if (accountIds.length > 1) {
      conditions.push(or(...accountIds.map((id) => eq(tables.transactions.accountId, id)))!)
    }
  }

  if (filters?.statementId) {
    const statementIds = Array.isArray(filters.statementId)
      ? filters.statementId
      : [filters.statementId]
    if (statementIds.length === 1) {
      conditions.push(eq(tables.transactions.statementId, statementIds[0]!))
    } else if (statementIds.length > 1) {
      conditions.push(or(...statementIds.map((id) => eq(tables.transactions.statementId, id)))!)
    }
  }

  if (filters?.category) {
    const categories = Array.isArray(filters.category) ? filters.category : [filters.category]
    if (categories.length === 1) {
      conditions.push(eq(tables.transactions.category, categories[0]!))
    } else if (categories.length > 1) {
      conditions.push(or(...categories.map((cat) => eq(tables.transactions.category, cat)))!)
    }
  }

  if (filters?.kind) {
    const kind = filters.kind
    if (kind === 'expense') {
      // Expenses are everything not listed under another kind
      const otherKinds: CategoryKind[] = ['income', 'investment', 'transfer']
      conditions.push(
        notInArray(tables.transactions.category, otherKinds.flatMap(getCategoryCodesByKind))
      )
    } else {
      conditions.push(inArray(tables.transactions.category, getCategoryCodesByKind(kind)))
    }
  }

  if (filters?.type) {
    conditions.push(eq(tables.transactions.type, filters.type))
  }

  if (filters?.startDate) {
    conditions.push(gte(tables.transactions.date, filters.startDate))
  }

  if (filters?.endDate) {
    conditions.push(lte(tables.transactions.date, filters.endDate))
  }

  if (filters?.search) {
    conditions.push(buildSearchCondition(filters.search))
  }

  if (filters?.isSubscription !== undefined) {
    conditions.push(eq(tables.transactions.isSubscription, filters.isSubscription))
  }

  if (filters?.reviewStatus) {
    const isPending = isNull(tables.transactions.summary)
    const isOther = and(
      isNotNull(tables.transactions.summary),
      eq(tables.transactions.category, 'other')
    )!
    conditions.push(eq(tables.transactions.isManuallyCategorized, false))
    conditions.push(
      filters.reviewStatus === 'pending'
        ? isPending
        : filters.reviewStatus === 'other'
          ? isOther
          : filters.reviewStatus === 'low_confidence'
            ? isLowConfidenceCategory()
            : or(isPending, isOther)!
    )
  }

  return conditions
}

/**
 * Get transactions with filters and pagination
 */
export async function getTransactions(
  userId: string,
  filters?: TransactionFilters,
  pagination?: PaginationOptions
): Promise<{ transactions: TransactionResponse[]; total: number; page: number; limit: number }> {
  const page = pagination?.page || 1
  const limit = pagination?.limit || 50
  const offset = (page - 1) * limit
  const sortBy = pagination?.sortBy || 'date'
  const sortOrder = pagination?.sortOrder || 'desc'

  const conditions = buildFilterConditions(userId, filters)

  // Build sort
  const sortColumn =
    sortBy === 'date'
      ? tables.transactions.date
      : sortBy === 'amount'
        ? tables.transactions.amount
        : tables.transactions.createdAt

  const orderFn = sortOrder === 'asc' ? asc : desc

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(tables.transactions)
    .where(and(...conditions))

  const total = Number(countResult[0]?.count || 0)

  // Get transactions
  const transactions = await db
    .select()
    .from(tables.transactions)
    .where(and(...conditions))
    .orderBy(orderFn(sortColumn))
    .limit(limit)
    .offset(offset)

  return {
    transactions: transactions.map(toTransactionResponse),
    total,
    page,
    limit,
  }
}

/** Most transactions one bulk action or "select all matching" covers */
export const MAX_BULK_TRANSACTIONS = 5000

/**
 * IDs of every transaction matching the filters (newest first), capped at MAX_BULK_TRANSACTIONS
 */
export async function getTransactionIds(
  userId: string,
  filters?: TransactionFilters
): Promise<{ ids: string[]; truncated: boolean }> {
  const rows = await db
    .select({ id: tables.transactions.id })
    .from(tables.transactions)
    .where(and(...buildFilterConditions(userId, filters)))
    .orderBy(desc(tables.transactions.date))
    .limit(MAX_BULK_TRANSACTIONS + 1)

  return {
    ids: rows.slice(0, MAX_BULK_TRANSACTIONS).map((row) => row.id),
    truncated: rows.length > MAX_BULK_TRANSACTIONS,
  }
}

/**
 * Get a transaction by ID
 */
export async function getTransactionById(
  transactionId: string,
  userId: string
): Promise<TransactionResponse | null> {
  const [txn] = await db
    .select()
    .from(tables.transactions)
    .where(and(eq(tables.transactions.id, transactionId), eq(tables.transactions.userId, userId)))
    .limit(1)

  return txn ? toTransactionResponse(txn) : null
}

const CLEAR_LINKS_CHUNK = 500

/** Record what the user did by hand so the auto-linker respects it: left unlinked vs chosen links */
async function rememberManualLinks(
  userId: string,
  unlinked: string[],
  linked: string[]
): Promise<void> {
  await setManuallyUnlinked(userId, unlinked, true)
  await setManuallyUnlinked(userId, linked, false)
}

/**
 * Undo the links of the given transactions on BOTH sides: each row's own link, the links of any
 * transaction pointing at it (`transaction` links), and the transaction it points at.
 * Returns the ids of the transactions whose link was cleared.
 */
export async function clearLinks(transactionIds: string[], userId: string): Promise<string[]> {
  const now = dbType === 'postgres' ? new Date() : new Date().toISOString()
  const cleared: string[] = []

  for (let i = 0; i < transactionIds.length; i += CLEAR_LINKS_CHUNK) {
    const chunk = transactionIds.slice(i, i + CLEAR_LINKS_CHUNK)
    const [selected, inbound] = await Promise.all([
      db
        .select({
          id: tables.transactions.id,
          linkedEntityId: tables.transactions.linkedEntityId,
          linkedEntityType: tables.transactions.linkedEntityType,
        })
        .from(tables.transactions)
        .where(and(eq(tables.transactions.userId, userId), inArray(tables.transactions.id, chunk))),
      db
        .select({ id: tables.transactions.id })
        .from(tables.transactions)
        .where(
          and(
            eq(tables.transactions.userId, userId),
            eq(tables.transactions.linkedEntityType, 'transaction'),
            inArray(tables.transactions.linkedEntityId, chunk)
          )
        ),
    ])

    const ids = idsToClear(
      selected,
      inbound.map((r) => r.id)
    )
    if (ids.length === 0) continue

    const updated = await db
      .update(tables.transactions)
      .set({ linkedEntityId: null, linkedEntityType: null, updatedAt: now as Date })
      .where(and(eq(tables.transactions.userId, userId), inArray(tables.transactions.id, ids)))
      .returning({ id: tables.transactions.id })
    cleared.push(...updated.map((r) => r.id))
  }

  return cleared
}

/**
 * Update a transaction (category, summary, isHidden, date, amount, type, entity linking).
 * The dedupe hash is left alone, so re-importing the same statement still dedupes. Links are kept
 * unless the edit sets another link or moves a card payment to another category; then both sides
 * of the old link are cleared.
 */
export async function updateTransaction(
  transactionId: string,
  userId: string,
  data: {
    category?: string
    summary?: string
    isHidden?: boolean
    date?: string
    amount?: number
    type?: 'credit' | 'debit'
    linkedEntityId?: string | null
    linkedEntityType?: 'credit_card' | 'insurance' | 'loan' | null
  }
): Promise<TransactionResponse> {
  // Verify ownership and get existing values for comparison
  const existing = await getTransactionById(transactionId, userId)
  if (!existing) {
    throw new Error('Transaction not found')
  }

  const now = dbType === 'postgres' ? new Date() : new Date().toISOString()

  const updateData: Partial<Transaction> = {
    updatedAt: now as Date,
  }

  // Track if category or summary actually changed
  let categoryOrSummaryChanged = false

  if (data.category !== undefined && data.category !== existing.category) {
    updateData.category = data.category
    // Reset confidence since user manually changed it
    updateData.categoryConfidence = '1.00' as unknown as typeof updateData.categoryConfidence
    categoryOrSummaryChanged = true
  }

  if (data.summary !== undefined && data.summary !== (existing.summary || '')) {
    updateData.summary = data.summary
    updateData.nameVersion = NAME_VERSION
    categoryOrSummaryChanged = true
  }

  // Only set isManuallyCategorized if category or summary actually changed
  if (categoryOrSummaryChanged) {
    updateData.isManuallyCategorized = true
  }

  if (data.isHidden !== undefined) {
    updateData.isHidden = data.isHidden
  }

  if (data.date !== undefined) {
    updateData.date = data.date
  }
  if (data.amount !== undefined) {
    updateData.amount = data.amount.toString() as unknown as Transaction['amount']
  }
  if (data.type !== undefined) {
    updateData.type = data.type
  }

  // A payment that stops being a card payment, or is pointed at another entity, lets go of its
  // old partner (the card credit pointing at it) before the new link is written
  const leavesCardPayments =
    existing.category === CARD_PAYMENT_CATEGORY &&
    data.category !== undefined &&
    data.category !== existing.category
  const linkChanged =
    data.linkedEntityId !== undefined &&
    (data.linkedEntityId !== existing.linkedEntityId ||
      (data.linkedEntityId !== null && data.linkedEntityType !== existing.linkedEntityType))
  if (leavesCardPayments || linkChanged) {
    const cleared = await clearLinks([transactionId], userId)
    if (linkChanged) {
      // A hand-made change: the old partners stay unlinked, and this row is only left to the
      // auto-linker when the user unlinked it
      await rememberManualLinks(
        userId,
        cleared.filter((id) => id !== transactionId),
        data.linkedEntityId ? [transactionId] : []
      )
      if (!data.linkedEntityId) await setManuallyUnlinked(userId, [transactionId], true)
    }
  }

  // Handle entity linking/unlinking (a card link sent along with a category move away is stale)
  if (
    data.linkedEntityId !== undefined &&
    !(leavesCardPayments && data.linkedEntityType === 'credit_card')
  ) {
    updateData.linkedEntityId = data.linkedEntityId
    updateData.linkedEntityType = data.linkedEntityId ? data.linkedEntityType : null
  }

  const [updated] = await db
    .update(tables.transactions)
    .set(updateData)
    .where(eq(tables.transactions.id, transactionId))
    .returning()

  if (!updated) {
    throw new Error('Failed to update transaction')
  }

  logger.debug(`[Transaction] Updated transaction ${transactionId}`)
  return toTransactionResponse(updated)
}

/**
 * Get the account's "manual entries" statement, creating it on first use.
 * It is a placeholder (no period, no balances) so manual transactions satisfy the
 * statement_id foreign key; coverage, balance and period logic skips it.
 */
async function getOrCreateManualStatement(account: Account): Promise<string> {
  const [existing] = await db
    .select({ id: tables.statements.id })
    .from(tables.statements)
    .where(
      and(
        eq(tables.statements.accountId, account.id),
        eq(tables.statements.documentType, MANUAL_DOCUMENT_TYPE)
      )
    )
    .limit(1)
  if (existing) return existing.id

  const now = dbType === 'postgres' ? new Date() : new Date().toISOString()
  const [created] = await db
    .insert(tables.statements)
    .values({
      accountId: account.id,
      profileId: account.profileId,
      userId: account.userId,
      documentType: MANUAL_DOCUMENT_TYPE,
      originalFilename: MANUAL_STATEMENT_FILENAME,
      fileType: MANUAL_DOCUMENT_TYPE,
      status: 'completed',
      transactionCount: 0,
      createdAt: now as Date,
      updatedAt: now as Date,
    })
    .returning({ id: tables.statements.id })

  if (!created) throw new Error('Failed to create manual entries statement')
  return created.id
}

/**
 * Add a transaction by hand to an account the user owns. The category is chosen by the
 * user, so transaction rules and the categorizer are not applied.
 */
export async function createManualTransaction(
  userId: string,
  data: {
    accountId: string
    date: string
    amount: number
    type: 'credit' | 'debit'
    summary: string
    category: string
    isHidden?: boolean
  }
): Promise<TransactionResponse> {
  const account = await getAccountByIdRaw(data.accountId, userId)
  if (!account) {
    throw new Error('Account not found')
  }

  const statementId = await getOrCreateManualStatement(account)
  const now = dbType === 'postgres' ? new Date() : new Date().toISOString()

  const [created] = await db
    .insert(tables.transactions)
    .values({
      accountId: account.id,
      statementId,
      profileId: account.profileId,
      userId,
      date: data.date,
      type: data.type,
      amount: data.amount.toString(),
      currency: account.currency,
      originalDescription: data.summary,
      summary: data.summary,
      nameVersion: NAME_VERSION,
      category: data.category,
      categoryConfidence: '1.00' as unknown as Transaction['categoryConfidence'],
      isManuallyCategorized: true,
      isHidden: data.isHidden ?? false,
      hash: `manual:${nanoid()}`,
      createdAt: now as Date,
      updatedAt: now as Date,
    })
    .returning()

  if (!created) {
    throw new Error('Failed to create transaction')
  }

  logger.debug(`[Transaction] Added manual transaction ${created.id} to account ${account.id}`)
  return toTransactionResponse(created)
}

/**
 * Add a transaction read from a bank alert message. The message guid makes the row idempotent:
 * the same message can never be imported twice. With a null summary the row is left for the
 * categorizer; otherwise the caller supplies the name and category (from a transaction rule, or
 * 'other').
 */
export async function createSmsTransaction(
  userId: string,
  data: {
    accountId: string
    guid: string
    date: string
    amount: number
    currency: string
    type: 'credit' | 'debit'
    merchant: string
    /** null leaves the row for the categorizer, like a statement import */
    summary: string | null
    category: string
    ruleMatched: boolean
  }
): Promise<TransactionResponse> {
  const account = await getAccountByIdRaw(data.accountId, userId)
  if (!account) {
    throw new Error('Account not found')
  }

  const statementId = await getOrCreateManualStatement(account)
  const now = dbType === 'postgres' ? new Date() : new Date().toISOString()

  const [created] = await db
    .insert(tables.transactions)
    .values({
      accountId: account.id,
      statementId,
      profileId: account.profileId,
      userId,
      date: data.date,
      type: data.type,
      amount: data.amount.toString(),
      currency: data.currency,
      originalDescription: data.merchant,
      summary: data.summary,
      nameVersion: NAME_VERSION,
      category: data.category,
      categoryConfidence: data.ruleMatched
        ? ('1.00' as unknown as Transaction['categoryConfidence'])
        : null,
      hash: `sms:${data.guid}`,
      createdAt: now as Date,
      updatedAt: now as Date,
    })
    .returning()

  if (!created) {
    throw new Error('Failed to create transaction')
  }

  logger.debug(`[Transaction] Added SMS transaction ${created.id} to account ${account.id}`)
  return toTransactionResponse(created)
}

/**
 * Update category, summary and/or hidden state on many transactions at once.
 * `confirmCategory` marks the current category as correct without changing it.
 * Only transactions owned by the user are touched; returns the number updated.
 * Changing a category drops loan/insurance links on rows whose category actually changes.
 * A card payment (or a row linked to a card) whose category changes loses its link on both sides.
 */
export async function bulkUpdateTransactions(
  transactionIds: string[],
  userId: string,
  data: { category?: string; summary?: string; isHidden?: boolean; confirmCategory?: boolean }
): Promise<number> {
  const now = dbType === 'postgres' ? new Date() : new Date().toISOString()

  const updateData: Partial<Transaction> = { updatedAt: now as Date }

  if (data.category !== undefined) {
    // Both sides of a card payment link go first, while the old category is still on the rows
    const leaving = await db
      .select({ id: tables.transactions.id })
      .from(tables.transactions)
      .where(
        and(
          inArray(tables.transactions.id, transactionIds),
          eq(tables.transactions.userId, userId),
          ne(tables.transactions.category, data.category),
          or(
            eq(tables.transactions.category, CARD_PAYMENT_CATEGORY),
            eq(tables.transactions.linkedEntityType, 'credit_card')
          )
        )
      )
    await clearLinks(
      leaving.map((r) => r.id),
      userId
    )

    updateData.category = data.category
    updateData.categoryConfidence = '1.00' as unknown as typeof updateData.categoryConfidence
    updateData.linkedEntityId =
      sql`CASE WHEN ${tables.transactions.category} <> ${data.category} AND ${tables.transactions.linkedEntityType} IN ('insurance', 'loan') THEN NULL ELSE ${tables.transactions.linkedEntityId} END` as unknown as null
    updateData.linkedEntityType =
      sql`CASE WHEN ${tables.transactions.category} <> ${data.category} AND ${tables.transactions.linkedEntityType} IN ('insurance', 'loan') THEN NULL ELSE ${tables.transactions.linkedEntityType} END` as unknown as null
  }
  if (data.summary !== undefined) {
    updateData.summary = data.summary
    updateData.nameVersion = NAME_VERSION
  }
  if (data.confirmCategory) {
    updateData.categoryConfidence = '1.00' as unknown as typeof updateData.categoryConfidence
  }
  if (data.category !== undefined || data.summary !== undefined || data.confirmCategory) {
    updateData.isManuallyCategorized = true
  }
  if (data.isHidden !== undefined) {
    updateData.isHidden = data.isHidden
  }

  const updated = await db
    .update(tables.transactions)
    .set(updateData)
    .where(
      and(inArray(tables.transactions.id, transactionIds), eq(tables.transactions.userId, userId))
    )
    .returning({ id: tables.transactions.id })

  logger.debug(`[Transaction] Bulk updated ${updated.length} transactions`)
  return updated.length
}

/**
 * Number of items waiting in each review queue
 */
export interface ReviewCounts {
  duplicateGroups: number
  pending: number
  other: number
  lowConfidence: number
  possibleMatches: number
}

/**
 * Count the items waiting in each review queue, for the given profile or for everyone
 */
export async function getReviewCounts(userId: string, profileId?: string): Promise<ReviewCounts> {
  const countFor = async (
    reviewStatus: 'pending' | 'other' | 'low_confidence'
  ): Promise<number> => {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tables.transactions)
      .where(and(...buildFilterConditions(userId, { profileId, reviewStatus })))
    return Number(row?.count || 0)
  }

  const [pending, other, lowConfidence, duplicateGroups, possibleMatches] = await Promise.all([
    countFor('pending'),
    countFor('other'),
    countFor('low_confidence'),
    findDuplicateGroups(userId, { profileId }),
    countPossibleMatches(userId, profileId),
  ])

  return {
    duplicateGroups: duplicateGroups.length,
    pending,
    other,
    lowConfidence,
    possibleMatches,
  }
}

/**
 * A set of transactions that look like the same transaction entered more than once
 */
export interface DuplicateGroup {
  key: string
  /** Group key plus its size: a new identical transaction changes it, so a dismissed group resurfaces */
  signature: string
  transactions: TransactionResponse[]
}

/**
 * Find likely duplicate transactions: same account, date, type, amount and
 * (case/whitespace-insensitive) description. Rows within a group are ordered
 * oldest-created first, so the first row is the one to keep.
 * Groups the user marked as not duplicates are left out, or returned alone with `dismissed`.
 */
export async function findDuplicateGroups(
  userId: string,
  filters?: TransactionFilters,
  dismissed = false
): Promise<DuplicateGroup[]> {
  const dismissedSignatures = new Set(await getDismissedDuplicates(userId))
  const rows = await db
    .select()
    .from(tables.transactions)
    .where(and(...buildFilterConditions(userId, filters)))
    .orderBy(asc(tables.transactions.createdAt), asc(tables.transactions.id))

  const groups = new Map<string, TransactionResponse[]>()
  for (const row of rows) {
    const txn = toTransactionResponse(row)
    const key = duplicateKey({
      accountId: txn.accountId,
      date: txn.date,
      type: txn.type,
      amount: txn.amount,
      description: txn.originalDescription,
    })
    const group = groups.get(key)
    if (group) {
      group.push(txn)
    } else {
      groups.set(key, [txn])
    }
  }

  return [...groups.entries()]
    .filter(([, transactions]) => transactions.length > 1)
    .map(([key, transactions]) => ({
      key,
      signature: `${key}#${transactions.length}`,
      transactions,
    }))
    .filter((group) => dismissedSignatures.has(group.signature) === dismissed)
    .sort((a, b) => b.transactions[0]!.date.localeCompare(a.transactions[0]!.date))
}

/**
 * Permanently delete transactions owned by the user.
 * Clears the links of the deleted rows on both sides, so nothing is left pointing at a deleted one.
 * Returns the number of transactions deleted.
 */
export async function bulkDeleteTransactions(
  transactionIds: string[],
  userId: string
): Promise<number> {
  await clearLinks(transactionIds, userId)

  const deleted = await db
    .delete(tables.transactions)
    .where(
      and(inArray(tables.transactions.id, transactionIds), eq(tables.transactions.userId, userId))
    )
    .returning({ id: tables.transactions.id, statementId: tables.transactions.statementId })

  // Record on each statement how many of its transactions were deleted
  const removedPerStatement = new Map<string, number>()
  for (const { statementId } of deleted) {
    removedPerStatement.set(statementId, (removedPerStatement.get(statementId) ?? 0) + 1)
  }
  for (const [statementId, removed] of removedPerStatement) {
    await db
      .update(tables.statements)
      .set({
        deletedTransactionCount: sql`COALESCE(${tables.statements.deletedTransactionCount}, 0) + ${removed}`,
      })
      .where(eq(tables.statements.id, statementId))
  }

  logger.debug(`[Transaction] Bulk deleted ${deleted.length} transactions`)
  return deleted.length
}

/**
 * Link two transactions together (bidirectional)
 * Used for transfers, refunds, and other transaction-to-transaction links.
 * Any previous partner of either side is unlinked first. A card bill payment (a bank debit in
 * the card payment category and a credit in a credit card account) is stored in the card-payment
 * shape: the debit points at the card account, the card credit at the debit.
 */
export async function linkTransactions(
  transactionId1: string,
  transactionId2: string,
  _linkType: 'payment' | 'transfer' | 'refund', // Kept for backward compatibility
  userId: string
): Promise<void> {
  // Verify ownership of both transactions
  const txn1 = await getTransactionById(transactionId1, userId)
  const txn2 = await getTransactionById(transactionId2, userId)

  if (!txn1 || !txn2) {
    throw new Error('One or both transactions not found')
  }

  const now = dbType === 'postgres' ? new Date() : new Date().toISOString()
  const cleared = await clearLinks([transactionId1, transactionId2], userId)
  await rememberManualLinks(
    userId,
    cleared.filter((id) => id !== transactionId1 && id !== transactionId2),
    [transactionId1, transactionId2]
  )

  const debit = txn1.type === 'debit' ? txn1 : txn2
  const credit = debit === txn1 ? txn2 : txn1
  const [creditAccount] =
    debit.type === 'debit' && credit.type === 'credit' && debit.category === CARD_PAYMENT_CATEGORY
      ? await db
          .select({ type: tables.accounts.type })
          .from(tables.accounts)
          .where(eq(tables.accounts.id, credit.accountId))
          .limit(1)
      : []

  const isCardPayment =
    creditAccount?.type === 'credit_card' && debit.accountId !== credit.accountId
  const pointers = isCardPayment
    ? [
        { id: debit.id, linkedEntityId: credit.accountId, linkedEntityType: 'credit_card' },
        { id: credit.id, linkedEntityId: debit.id, linkedEntityType: 'transaction' },
      ]
    : [
        { id: transactionId1, linkedEntityId: transactionId2, linkedEntityType: 'transaction' },
        { id: transactionId2, linkedEntityId: transactionId1, linkedEntityType: 'transaction' },
      ]

  for (const { id, linkedEntityId, linkedEntityType } of pointers) {
    await db
      .update(tables.transactions)
      .set({ linkedEntityId, linkedEntityType, updatedAt: now as Date })
      .where(eq(tables.transactions.id, id))
  }

  logger.debug(`[Transaction] Linked transactions ${transactionId1} <-> ${transactionId2}`)
}

/**
 * Unlink a transaction from its linked entity.
 * Both sides go: the partner it points at and any transaction pointing at it.
 */
export async function unlinkTransaction(transactionId: string, userId: string): Promise<void> {
  const txn = await getTransactionById(transactionId, userId)
  if (!txn) {
    throw new Error('Transaction not found')
  }

  const [pointedAtBy] = txn.linkedEntityId
    ? []
    : await db
        .select({ id: tables.transactions.id })
        .from(tables.transactions)
        .where(
          and(
            eq(tables.transactions.userId, userId),
            eq(tables.transactions.linkedEntityType, 'transaction'),
            eq(tables.transactions.linkedEntityId, transactionId)
          )
        )
        .limit(1)

  if (!txn.linkedEntityId && !pointedAtBy) {
    throw new Error('Transaction is not linked')
  }

  const cleared = await clearLinks([transactionId], userId)
  await setManuallyUnlinked(userId, [transactionId, ...cleared], true)

  logger.debug(`[Transaction] Unlinked transaction ${transactionId}`)
}

/**
 * Find potential link candidates for a transaction
 * Used for auto-suggesting links
 */
export async function findLinkCandidates(
  transactionId: string,
  userId: string
): Promise<TransactionResponse[]> {
  const txn = await getTransactionById(transactionId, userId)
  if (!txn) {
    throw new Error('Transaction not found')
  }

  // Look for transactions with:
  // - Same amount
  // - Opposite type (debit <-> credit)
  // - Within 3 days
  // - Different account
  // - Not already linked

  const oppositeType = txn.type === 'credit' ? 'debit' : 'credit'

  // Date range: ±3 days
  const txnDate = new Date(txn.date)
  const startDate = new Date(txnDate)
  startDate.setDate(startDate.getDate() - 3)
  const endDate = new Date(txnDate)
  endDate.setDate(endDate.getDate() + 3)

  const startDateStr = startDate.toISOString().split('T')[0]!
  const endDateStr = endDate.toISOString().split('T')[0]!

  const candidates = await db
    .select()
    .from(tables.transactions)
    .where(
      and(
        eq(tables.transactions.userId, userId),
        eq(tables.transactions.type, oppositeType),
        eq(tables.transactions.amount, txn.amount.toString()),
        eq(tables.transactions.isHidden, false), // Exclude hidden transactions
        gte(tables.transactions.date, startDateStr),
        lte(tables.transactions.date, endDateStr),
        sql`${tables.transactions.accountId} != ${txn.accountId}`,
        sql`${tables.transactions.linkedEntityId} IS NULL`
      )
    )
    .limit(10)

  return candidates.map(toTransactionResponse)
}

/**
 * Get raw ledger statistics: credits and debits as recorded, without categorisation.
 * Income, expense and investment totals come from cashflow.ts.
 */
export async function getTransactionStats(
  userId: string,
  filters?: {
    profileId?: string
    accountId?: string | string[]
    statementId?: string | string[]
    startDate?: string
    endDate?: string
    category?: string | string[]
    type?: 'credit' | 'debit'
    search?: string
    isSubscription?: boolean
    includeHidden?: boolean
    onlyHidden?: boolean
  }
): Promise<{
  totalCredits: number
  totalDebits: number
  creditCount: number
  debitCount: number
  netAmount: number
  currency: string
}> {
  const conditions = [eq(tables.transactions.userId, userId)]

  if (filters?.onlyHidden) {
    conditions.push(eq(tables.transactions.isHidden, true))
  } else if (!filters?.includeHidden) {
    // Exclude hidden transactions by default
    conditions.push(eq(tables.transactions.isHidden, false))
  }

  if (filters?.profileId) {
    conditions.push(eq(tables.transactions.profileId, filters.profileId))
  }

  if (filters?.accountId) {
    const accountIds = Array.isArray(filters.accountId) ? filters.accountId : [filters.accountId]
    if (accountIds.length === 1) {
      conditions.push(eq(tables.transactions.accountId, accountIds[0]!))
    } else if (accountIds.length > 1) {
      conditions.push(or(...accountIds.map((id) => eq(tables.transactions.accountId, id)))!)
    }
  }

  if (filters?.statementId) {
    const statementIds = Array.isArray(filters.statementId)
      ? filters.statementId
      : [filters.statementId]
    if (statementIds.length === 1) {
      conditions.push(eq(tables.transactions.statementId, statementIds[0]!))
    } else if (statementIds.length > 1) {
      conditions.push(or(...statementIds.map((id) => eq(tables.transactions.statementId, id)))!)
    }
  }

  if (filters?.startDate) {
    conditions.push(gte(tables.transactions.date, filters.startDate))
  }

  if (filters?.endDate) {
    conditions.push(lte(tables.transactions.date, filters.endDate))
  }

  if (filters?.category) {
    const categories = Array.isArray(filters.category) ? filters.category : [filters.category]
    if (categories.length === 1) {
      conditions.push(eq(tables.transactions.category, categories[0]!))
    } else if (categories.length > 1) {
      conditions.push(or(...categories.map((cat) => eq(tables.transactions.category, cat)))!)
    }
  }

  if (filters?.type) {
    conditions.push(eq(tables.transactions.type, filters.type))
  }

  if (filters?.search) {
    conditions.push(buildSearchCondition(filters.search))
  }

  if (filters?.isSubscription !== undefined) {
    conditions.push(eq(tables.transactions.isSubscription, filters.isSubscription))
  }

  const transactions = await db
    .select()
    .from(tables.transactions)
    .where(and(...conditions))

  let totalCredits = 0
  let totalDebits = 0
  let creditCount = 0
  let debitCount = 0

  for (const txn of transactions) {
    const amount = typeof txn.amount === 'string' ? parseFloat(txn.amount) : Number(txn.amount)

    if (txn.type === 'credit') {
      totalCredits += amount
      creditCount++
    } else {
      totalDebits += amount
      debitCount++
    }
  }

  // Get currency from transactions (default to INR if no transactions)
  const currency = transactions[0]?.currency || 'INR'

  return {
    totalCredits,
    totalDebits,
    creditCount,
    debitCount,
    netAmount: totalCredits - totalDebits,
    currency,
  }
}

/**
 * Detected subscription
 */
export interface DetectedSubscription {
  /** Merchant key; identifies the subscription when the user edits or removes it */
  key: string
  name: string
  category: string
  amount: number
  frequency: 'monthly' | 'quarterly' | 'yearly' | 'unknown'
  lastChargeDate: string
  chargeCount: number
  transactions: Array<{ id: string; date: string; amount: number }>
  // Account info
  accountId: string | null
  accountLast4: string | null
  accountType: string | null
  institution: string | null
  // Profile info (for family view)
  profileId: string
  // Active status
  isActive: boolean
  /** True when the user set the frequency instead of it being detected */
  isFrequencySet: boolean
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * Get detected subscriptions from transaction data
 * Groups transactions marked as subscriptions by their name
 */
export async function getDetectedSubscriptions(
  userId: string,
  profileId: string | undefined
): Promise<{ subscriptions: DetectedSubscription[]; totalMonthly: number; currency: string }> {
  // Fetch all subscription transactions with account info (last 12 months for pattern detection)
  const now = new Date()
  const startDate = new Date(now.getFullYear(), now.getMonth() - 12, 1)
  const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-01`

  // Build query conditions
  const conditions = [
    eq(tables.transactions.userId, userId),
    eq(tables.transactions.isSubscription, true),
    eq(tables.transactions.type, 'debit'),
    eq(tables.transactions.isHidden, false), // Exclude hidden transactions
    gte(tables.transactions.date, startDateStr),
  ]

  // Only filter by profileId if provided (undefined = family view, all profiles)
  if (profileId) {
    conditions.push(eq(tables.transactions.profileId, profileId))
  }

  const transactionsWithAccounts = await db
    .select({
      transaction: tables.transactions,
      account: {
        id: tables.accounts.id,
        accountNumber: tables.accounts.accountNumber,
        type: tables.accounts.type,
        institution: tables.accounts.institution,
      },
    })
    .from(tables.transactions)
    .leftJoin(tables.accounts, eq(tables.transactions.accountId, tables.accounts.id))
    .where(and(...conditions))
    .orderBy(desc(tables.transactions.date))

  // Group by name (summary) or fallback to original description
  const subscriptionGroups = new Map<
    string,
    {
      name: string
      category: string
      transactions: Array<{ id: string; date: string; amount: number }>
      accountId: string | null
      accountLast4: string | null
      accountType: string | null
      institution: string | null
      profileId: string
    }
  >()

  for (const row of transactionsWithAccounts) {
    const txn = row.transaction
    const account = row.account

    // Group by the whole name (same merchant or person always has the same name)
    const name = merchantName(txn)
    const groupKey = merchantKey(txn)

    // Get last 4 digits of account number (decrypt first since it's encrypted in DB)
    const decryptedAccountNumber = account?.accountNumber
      ? decryptOptional(account.accountNumber)
      : null
    const accountLast4 = decryptedAccountNumber ? decryptedAccountNumber.slice(-4) : null

    if (!subscriptionGroups.has(groupKey)) {
      subscriptionGroups.set(groupKey, {
        name,
        category: txn.category,
        transactions: [],
        accountId: account?.id || null,
        accountLast4,
        accountType: account?.type || null,
        institution: account?.institution || null,
        profileId: txn.profileId,
      })
    }

    const group = subscriptionGroups.get(groupKey)!
    const amount = typeof txn.amount === 'string' ? parseFloat(txn.amount) : Number(txn.amount)
    group.transactions.push({
      id: txn.id,
      date: txn.date,
      amount,
    })
  }

  // Calculate frequency and build subscription objects
  const subscriptions: DetectedSubscription[] = []
  const today = new Date()

  const overrides = await getSubscriptionOverrides(userId)

  for (const [key, group] of subscriptionGroups) {
    if (group.transactions.length === 0) continue

    // The user removed this subscription
    const override = overrides.get(key)
    if (override?.isRemoved) continue

    // Sort transactions by date (newest first)
    group.transactions.sort((a, b) => b.date.localeCompare(a.date))

    // Group transactions by month to handle multiple charges per month (e.g., Furlenco with 3 furniture items)
    const monthlyTotals = new Map<string, number>()
    for (const txn of group.transactions) {
      const monthKey = txn.date.substring(0, 7) // "YYYY-MM"
      monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) || 0) + txn.amount)
    }

    // Calculate average monthly cost (using last 3 months if available)
    const monthlyAmounts = Array.from(monthlyTotals.values())
    const recentMonths = monthlyAmounts.slice(0, 3)
    const avgAmount = recentMonths.reduce((sum, a) => sum + a, 0) / recentMonths.length

    // Individual transaction amounts for potential future CV calculation
    const _amounts = group.transactions.map((t) => t.amount)

    // Get last charge date info
    const lastChargeDate = new Date(group.transactions[0]!.date)
    const daysSinceLastCharge = Math.floor(
      (today.getTime() - lastChargeDate.getTime()) / (1000 * 60 * 60 * 24)
    )

    // Detect frequency by analyzing gaps between transactions
    let frequency: DetectedSubscription['frequency'] = 'unknown'

    // Get unique months sorted (newest first)
    const uniqueMonths = Array.from(monthlyTotals.keys()).sort((a, b) => b.localeCompare(a))

    if (override?.frequency) {
      // The user set the frequency, so skip detection
      frequency = override.frequency
    } else if (uniqueMonths.length >= 2) {
      // Calculate gaps between months (not individual transactions)
      // This handles cases like Furlenco where there are multiple charges per month
      const monthGaps: number[] = []
      for (let i = 0; i < uniqueMonths.length - 1; i++) {
        const [year1, month1] = uniqueMonths[i]!.split('-').map(Number)
        const [year2, month2] = uniqueMonths[i + 1]!.split('-').map(Number)
        const monthsDiff = (year1! - year2!) * 12 + (month1! - month2!)
        monthGaps.push(monthsDiff)
      }

      const avgMonthGap = monthGaps.reduce((sum, g) => sum + g, 0) / monthGaps.length

      // Calculate coefficient of variation (CV) for intervals and monthly amounts
      // CV = standard deviation / mean - measures consistency
      const calcCV = (values: number[]): number => {
        if (values.length < 2) return 0
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length
        if (mean === 0) return 0
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
        const stdDev = Math.sqrt(variance)
        return stdDev / mean
      }

      const intervalCV = calcCV(monthGaps)
      const monthlyAmountCV = calcCV(monthlyAmounts)

      // If BOTH intervals and monthly amounts are highly inconsistent, this is not a true subscription
      // (e.g., random purchases from same vendor like Namecheap domain renewals)
      // CV > 0.5 means standard deviation is more than 50% of mean
      if (intervalCV > 0.5 && monthlyAmountCV > 0.5 && uniqueMonths.length >= 3) {
        continue // Skip this group - not a true subscription
      }

      // Detect frequency based on average month gap
      if (avgMonthGap <= 1.5) {
        frequency = 'monthly'
      } else if (avgMonthGap <= 4) {
        frequency = 'quarterly'
      } else if (avgMonthGap <= 13) {
        frequency = 'yearly'
      }
    } else {
      // Single transaction: if at least 2 months old, consider yearly
      // Otherwise we don't know yet
      if (daysSinceLastCharge >= 60) {
        frequency = 'yearly'
      }
      // If less than 2 months old, keep as 'unknown' - we can't determine yet
    }

    // Determine if subscription is active based on frequency
    let isActive = true
    switch (frequency) {
      case 'monthly':
        // Inactive if no charges in last 2 months (60 days)
        isActive = daysSinceLastCharge <= 60
        break
      case 'quarterly':
        // Inactive if no charges in last 4 months (120 days)
        isActive = daysSinceLastCharge <= 120
        break
      case 'yearly':
        // Inactive if no charges in last 14 months (425 days)
        isActive = daysSinceLastCharge <= 425
        break
      case 'unknown':
        // For unknown frequency, consider active if charged in last 3 months
        isActive = daysSinceLastCharge <= 90
        break
    }

    subscriptions.push({
      key,
      name: group.name,
      category: group.category,
      amount: round2(avgAmount),
      frequency,
      lastChargeDate: group.transactions[0]!.date,
      chargeCount: group.transactions.length,
      transactions: group.transactions, // Keep all transactions
      accountId: group.accountId,
      accountLast4: group.accountLast4,
      accountType: group.accountType,
      institution: group.institution,
      profileId: group.profileId,
      isActive,
      isFrequencySet: !!override?.frequency,
    })
  }

  // Helper to get monthly equivalent price
  const getMonthlyPrice = (sub: DetectedSubscription): number => {
    switch (sub.frequency) {
      case 'quarterly':
        return sub.amount / 3
      case 'yearly':
        return sub.amount / 12
      default:
        return sub.amount
    }
  }

  // Sort by monthly equivalent price descending (highest monthly cost first)
  subscriptions.sort((a, b) => getMonthlyPrice(b) - getMonthlyPrice(a))

  // Calculate total monthly cost (only for active subscriptions)
  let totalMonthly = 0
  for (const sub of subscriptions) {
    // Only count active subscriptions toward monthly cost
    if (!sub.isActive) continue

    switch (sub.frequency) {
      case 'monthly':
        totalMonthly += sub.amount
        break
      case 'quarterly':
        totalMonthly += sub.amount / 3
        break
      case 'yearly':
        totalMonthly += sub.amount / 12
        break
      case 'unknown':
        // For unknown frequency, don't include in monthly total
        // since we can't reliably estimate the recurring cost
        break
    }
  }

  const currency = transactionsWithAccounts[0]?.transaction.currency || 'INR'

  return {
    subscriptions,
    totalMonthly: round2(totalMonthly),
    currency,
  }
}
