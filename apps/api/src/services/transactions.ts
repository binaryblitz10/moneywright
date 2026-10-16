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
  isNull,
  isNotNull,
} from 'drizzle-orm'
import { db, tables, dbType } from '../db'
import type { Transaction } from '../db'
import { logger } from '../lib/logger'
import { decryptOptional } from '../lib/encryption'

/**
 * Transaction service
 * Handles transaction CRUD and cross-account linking
 */

/**
 * Transaction response type
 */
/**
 * Parse a search term as an exact amount (e.g. "1,112.52" or "₹33247.9")
 * Returns null when the term isn't a plain number
 */
function parseAmountSearch(search: string): number | null {
  const cleaned = search.replace(/[₹$€£,\s]/g, '')
  return /^\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null
}

/**
 * Search condition: description/summary text match, plus an exact amount match
 * when the term is a number (tolerance covers float storage on SQLite)
 */
function buildSearchCondition(search: string) {
  const searchTerm = `%${search}%`
  const amount = parseAmountSearch(search)
  const textMatch = [
    like(tables.transactions.originalDescription, searchTerm),
    like(tables.transactions.summary, searchTerm),
  ]
  if (amount !== null) {
    textMatch.push(sql`ABS(${tables.transactions.amount} - ${amount}) < 0.005`)
  }
  return or(...textMatch)!
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
  // 'all' = either
  reviewStatus?: ReviewStatus
}

export type ReviewStatus = 'pending' | 'other' | 'all'

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

/**
 * Update a transaction (category, summary, isHidden, entity linking)
 */
export async function updateTransaction(
  transactionId: string,
  userId: string,
  data: {
    category?: string
    summary?: string
    isHidden?: boolean
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
    categoryOrSummaryChanged = true
  }

  // Only set isManuallyCategorized if category or summary actually changed
  if (categoryOrSummaryChanged) {
    updateData.isManuallyCategorized = true
  }

  if (data.isHidden !== undefined) {
    updateData.isHidden = data.isHidden
  }

  // Handle entity linking/unlinking
  if (data.linkedEntityId !== undefined) {
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
 * Update category, summary and/or hidden state on many transactions at once.
 * Only transactions owned by the user are touched; returns the number updated.
 * Changing a category drops loan/insurance/credit-card links on rows whose category
 * actually changes (transaction-to-transaction links are kept).
 */
export async function bulkUpdateTransactions(
  transactionIds: string[],
  userId: string,
  data: { category?: string; summary?: string; isHidden?: boolean }
): Promise<number> {
  const now = dbType === 'postgres' ? new Date() : new Date().toISOString()

  const updateData: Partial<Transaction> = { updatedAt: now as Date }

  if (data.category !== undefined) {
    updateData.category = data.category
    updateData.categoryConfidence = '1.00' as unknown as typeof updateData.categoryConfidence
    updateData.linkedEntityId =
      sql`CASE WHEN ${tables.transactions.category} <> ${data.category} AND ${tables.transactions.linkedEntityType} IN ('credit_card', 'insurance', 'loan') THEN NULL ELSE ${tables.transactions.linkedEntityId} END` as unknown as null
    updateData.linkedEntityType =
      sql`CASE WHEN ${tables.transactions.category} <> ${data.category} AND ${tables.transactions.linkedEntityType} IN ('credit_card', 'insurance', 'loan') THEN NULL ELSE ${tables.transactions.linkedEntityType} END` as unknown as null
  }
  if (data.summary !== undefined) {
    updateData.summary = data.summary
  }
  if (data.category !== undefined || data.summary !== undefined) {
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
}

/**
 * Count the items waiting in each review queue, for the given profile or for everyone
 */
export async function getReviewCounts(userId: string, profileId?: string): Promise<ReviewCounts> {
  const countFor = async (reviewStatus: 'pending' | 'other'): Promise<number> => {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tables.transactions)
      .where(and(...buildFilterConditions(userId, { profileId, reviewStatus })))
    return Number(row?.count || 0)
  }

  const [pending, other, duplicateGroups] = await Promise.all([
    countFor('pending'),
    countFor('other'),
    findDuplicateGroups(userId, { profileId }),
  ])

  return { duplicateGroups: duplicateGroups.length, pending, other }
}

/**
 * A set of transactions that look like the same transaction entered more than once
 */
export interface DuplicateGroup {
  key: string
  transactions: TransactionResponse[]
}

/**
 * Find likely duplicate transactions: same account, date, type, amount and
 * (case/whitespace-insensitive) description. Rows within a group are ordered
 * oldest-created first, so the first row is the one to keep.
 */
export async function findDuplicateGroups(
  userId: string,
  filters?: TransactionFilters
): Promise<DuplicateGroup[]> {
  const rows = await db
    .select()
    .from(tables.transactions)
    .where(and(...buildFilterConditions(userId, filters)))
    .orderBy(asc(tables.transactions.createdAt), asc(tables.transactions.id))

  const groups = new Map<string, TransactionResponse[]>()
  for (const row of rows) {
    const txn = toTransactionResponse(row)
    const description = txn.originalDescription.toLowerCase().replace(/\s+/g, ' ').trim()
    const key = [txn.accountId, txn.date, txn.type, txn.amount.toFixed(2), description].join('|')
    const group = groups.get(key)
    if (group) {
      group.push(txn)
    } else {
      groups.set(key, [txn])
    }
  }

  return [...groups.entries()]
    .filter(([, transactions]) => transactions.length > 1)
    .map(([key, transactions]) => ({ key, transactions }))
    .sort((a, b) => b.transactions[0]!.date.localeCompare(a.transactions[0]!.date))
}

/**
 * Permanently delete transactions owned by the user.
 * Clears the link on any transaction that was linked to a deleted one.
 * Returns the number of transactions deleted.
 */
export async function bulkDeleteTransactions(
  transactionIds: string[],
  userId: string
): Promise<number> {
  const now = dbType === 'postgres' ? new Date() : new Date().toISOString()

  await db
    .update(tables.transactions)
    .set({ linkedEntityId: null, linkedEntityType: null, updatedAt: now as Date })
    .where(
      and(
        eq(tables.transactions.userId, userId),
        eq(tables.transactions.linkedEntityType, 'transaction'),
        inArray(tables.transactions.linkedEntityId, transactionIds)
      )
    )

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
 * Used for transfers, refunds, and other transaction-to-transaction links
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

  // Update both transactions to link to each other
  await db
    .update(tables.transactions)
    .set({
      linkedEntityId: transactionId2,
      linkedEntityType: 'transaction',
      updatedAt: now as Date,
    })
    .where(eq(tables.transactions.id, transactionId1))

  await db
    .update(tables.transactions)
    .set({
      linkedEntityId: transactionId1,
      linkedEntityType: 'transaction',
      updatedAt: now as Date,
    })
    .where(eq(tables.transactions.id, transactionId2))

  logger.debug(`[Transaction] Linked transactions ${transactionId1} <-> ${transactionId2}`)
}

/**
 * Unlink a transaction from its linked entity
 * If linked to another transaction (bidirectional), unlinks both sides
 */
export async function unlinkTransaction(transactionId: string, userId: string): Promise<void> {
  const txn = await getTransactionById(transactionId, userId)
  if (!txn) {
    throw new Error('Transaction not found')
  }

  if (!txn.linkedEntityId) {
    throw new Error('Transaction is not linked')
  }

  const now = dbType === 'postgres' ? new Date() : new Date().toISOString()

  // Unlink this transaction
  await db
    .update(tables.transactions)
    .set({
      linkedEntityId: null,
      linkedEntityType: null,
      updatedAt: now as Date,
    })
    .where(eq(tables.transactions.id, transactionId))

  // If linked to another transaction, unlink that side too
  if (txn.linkedEntityType === 'transaction') {
    await db
      .update(tables.transactions)
      .set({
        linkedEntityId: null,
        linkedEntityType: null,
        updatedAt: now as Date,
      })
      .where(eq(tables.transactions.id, txn.linkedEntityId))
  }

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
}

/**
 * Get detected subscriptions from transaction data
 * Groups transactions marked as subscriptions by their summary/description
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

  // Group by summary (LLM-generated clean name) or fallback to original description
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

    // Use summary if available, otherwise use first 50 chars of description
    const name = txn.summary || txn.originalDescription.substring(0, 50).trim()
    // Group by first word only (lowercase) to handle inconsistent naming like "Furlenco rent" vs "Furlenco rental"
    const firstWord = name.split(/\s+/)[0] || name
    const groupKey = firstWord.toLowerCase().trim()

    // Get last 4 digits of account number (decrypt first since it's encrypted in DB)
    const decryptedAccountNumber = account?.accountNumber
      ? decryptOptional(account.accountNumber)
      : null
    const accountLast4 = decryptedAccountNumber ? decryptedAccountNumber.slice(-4) : null

    if (!subscriptionGroups.has(groupKey)) {
      subscriptionGroups.set(groupKey, {
        name: firstWord, // Use just the first word as the display name
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

  for (const [, group] of subscriptionGroups) {
    if (group.transactions.length === 0) continue

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

    if (uniqueMonths.length >= 2) {
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
      name: group.name,
      category: group.category,
      amount: Math.round(avgAmount),
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
    totalMonthly: Math.round(totalMonthly),
    currency,
  }
}
