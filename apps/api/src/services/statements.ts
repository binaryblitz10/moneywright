import { eq, and, desc, inArray, isNull, like, ne } from 'drizzle-orm'
import { db, tables, dbType } from '../db'
import { MANUAL_DOCUMENT_TYPE } from '../lib/manual-statement'
import type { Statement } from '../db'
import { logger } from '../lib/logger'
import type { CountryCode, FileType } from '../lib/constants'
import { nanoid } from '../lib/id'
import {
  INTERRUPTED_STATEMENT_MESSAGE,
  PLACEHOLDER_ACCOUNT_PREFIX,
  findOrphanPlaceholderAccountIds,
  groupByAccount,
  isCategorizableDocumentType,
  type UncategorizedAccountGroup,
} from '../lib/statement-recovery'

/**
 * Statement service - simplified
 */

export type StatementStatus = 'pending' | 'parsing' | 'completed' | 'failed'

export interface BankStatementSummary {
  type: 'bank_statement'
  openingBalance?: number
  closingBalance?: number
  totalCredits?: number
  totalDebits?: number
  creditCount?: number
  debitCount?: number
  /** Transactions skipped because an earlier overlapping statement already imported them */
  skippedDuplicateCount?: number
}

export interface CreditCardStatementSummary {
  type: 'credit_card_statement'
  creditLimit?: number
  availableLimit?: number
  previousBalance?: number
  paymentsReceived?: number
  newCharges?: number
  totalDue?: number
  minimumDue?: number
  dueDate?: string
  creditCount?: number
  debitCount?: number
  /** Transactions skipped because an earlier overlapping statement already imported them */
  skippedDuplicateCount?: number
}

export type StatementSummary = BankStatementSummary | CreditCardStatementSummary

export interface StatementResponse {
  id: string
  accountId: string | null
  sourceId: string | null
  profileId: string
  userId: string
  originalFilename: string
  fileType: string
  fileSizeBytes: number | null
  documentType: string
  periodStart: string | null
  periodEnd: string | null
  openingBalance: number | null
  closingBalance: number | null
  status: StatementStatus
  errorMessage: string | null
  summary: StatementSummary | null
  transactionCount: number
  deletedTransactionCount: number
  holdingsCount: number | null
  parseStartedAt: string | Date | null
  parseCompletedAt: string | Date | null
  parseDurationMs: number | null
  createdAt: string | Date
  updatedAt: string | Date
}

/**
 * Input for processing a statement
 */
export interface StatementInput {
  statementId: string
  profileId: string
  userId: string
  pages: string[]
  fileType: FileType
  documentType?: 'bank_statement' | 'investment_statement'
  sourceType?: string
  parsingModel?: string
  /** Password used to decrypt the file (for saving to account after parsing) */
  password?: string
  /** Whether to save the password to the account */
  savePassword?: boolean
}

function toStatementResponse(statement: Statement): StatementResponse {
  let summary: StatementSummary | null = null
  if (statement.summary) {
    if (typeof statement.summary === 'string') {
      try {
        summary = JSON.parse(statement.summary)
      } catch {
        summary = null
      }
    } else {
      summary = statement.summary as StatementSummary
    }
  }

  let parseDurationMs: number | null = null
  if (statement.parseStartedAt && statement.parseCompletedAt) {
    const startTime =
      typeof statement.parseStartedAt === 'string'
        ? new Date(statement.parseStartedAt).getTime()
        : statement.parseStartedAt.getTime()
    const endTime =
      typeof statement.parseCompletedAt === 'string'
        ? new Date(statement.parseCompletedAt).getTime()
        : statement.parseCompletedAt.getTime()
    parseDurationMs = endTime - startTime
  }

  return {
    id: statement.id,
    accountId: statement.accountId,
    sourceId: statement.sourceId || null,
    profileId: statement.profileId,
    userId: statement.userId,
    originalFilename: statement.originalFilename,
    fileType: statement.fileType,
    fileSizeBytes: statement.fileSizeBytes,
    documentType: statement.documentType || 'bank_statement',
    periodStart: statement.periodStart,
    periodEnd: statement.periodEnd,
    openingBalance: statement.openingBalance != null ? Number(statement.openingBalance) : null,
    closingBalance: statement.closingBalance != null ? Number(statement.closingBalance) : null,
    status: statement.status as StatementStatus,
    errorMessage: statement.errorMessage,
    summary,
    transactionCount: statement.transactionCount || 0,
    deletedTransactionCount: statement.deletedTransactionCount || 0,
    holdingsCount: statement.holdingsCount || null,
    parseStartedAt: statement.parseStartedAt || null,
    parseCompletedAt: statement.parseCompletedAt || null,
    parseDurationMs,
    createdAt: statement.createdAt,
    updatedAt: statement.updatedAt,
  }
}

export async function getStatementsByUserId(
  userId: string,
  options?: { profileId?: string; accountId?: string }
): Promise<StatementResponse[]> {
  const conditions = [
    eq(tables.statements.userId, userId),
    ne(tables.statements.documentType, MANUAL_DOCUMENT_TYPE),
  ]
  if (options?.profileId) conditions.push(eq(tables.statements.profileId, options.profileId))
  if (options?.accountId) conditions.push(eq(tables.statements.accountId, options.accountId))

  const statements = await db
    .select()
    .from(tables.statements)
    .where(and(...conditions))
    .orderBy(desc(tables.statements.createdAt))

  return statements.map(toStatementResponse)
}

export async function getStatementById(
  statementId: string,
  userId: string
): Promise<StatementResponse | null> {
  const [statement] = await db
    .select()
    .from(tables.statements)
    .where(and(eq(tables.statements.id, statementId), eq(tables.statements.userId, userId)))
    .limit(1)

  return statement ? toStatementResponse(statement) : null
}

export async function getStatementStatus(
  statementId: string,
  userId: string
): Promise<{
  status: StatementStatus
  transactionCount: number
  errorMessage: string | null
  parseStartedAt: string | Date | null
  parseCompletedAt: string | Date | null
  parseDurationMs: number | null
} | null> {
  const [statement] = await db
    .select({
      status: tables.statements.status,
      transactionCount: tables.statements.transactionCount,
      errorMessage: tables.statements.errorMessage,
      parseStartedAt: tables.statements.parseStartedAt,
      parseCompletedAt: tables.statements.parseCompletedAt,
    })
    .from(tables.statements)
    .where(and(eq(tables.statements.id, statementId), eq(tables.statements.userId, userId)))
    .limit(1)

  if (!statement) return null

  let parseDurationMs: number | null = null
  if (statement.parseStartedAt && statement.parseCompletedAt) {
    const startTime =
      typeof statement.parseStartedAt === 'string'
        ? new Date(statement.parseStartedAt).getTime()
        : statement.parseStartedAt.getTime()
    const endTime =
      typeof statement.parseCompletedAt === 'string'
        ? new Date(statement.parseCompletedAt).getTime()
        : statement.parseCompletedAt.getTime()
    parseDurationMs = endTime - startTime
  }

  return {
    status: statement.status as StatementStatus,
    transactionCount: statement.transactionCount || 0,
    errorMessage: statement.errorMessage,
    parseStartedAt: statement.parseStartedAt || null,
    parseCompletedAt: statement.parseCompletedAt || null,
    parseDurationMs,
  }
}

export async function createStatement(data: {
  accountId: string | null
  profileId: string
  userId: string
  originalFilename: string
  fileType: string
  fileSizeBytes: number
  documentType?: 'bank_statement' | 'investment_statement'
}): Promise<Statement> {
  const now = dbType === 'postgres' ? new Date() : new Date().toISOString()

  const [statement] = await db
    .insert(tables.statements)
    .values({
      accountId: data.accountId,
      profileId: data.profileId,
      userId: data.userId,
      originalFilename: data.originalFilename,
      fileType: data.fileType,
      fileSizeBytes: data.fileSizeBytes,
      documentType: data.documentType || 'bank_statement',
      status: 'pending',
      transactionCount: 0,
      createdAt: now as Date,
      updatedAt: now as Date,
    })
    .returning()

  if (!statement) throw new Error('Failed to create statement record')
  return statement
}

export async function updateStatementStatus(
  statementId: string,
  status: StatementStatus,
  errorMessage?: string
): Promise<void> {
  const now = dbType === 'postgres' ? new Date() : new Date().toISOString()

  await db
    .update(tables.statements)
    .set({
      status,
      errorMessage: errorMessage || null,
      updatedAt: now as Date,
    })
    .where(eq(tables.statements.id, statementId))
}

export async function updateStatementResults(
  statementId: string,
  data: {
    periodStart?: string | null
    periodEnd?: string | null
    openingBalance?: number | null
    closingBalance?: number | null
    summary?: StatementSummary | null
    transactionCount: number
    parseStartedAt?: Date
    parseCompletedAt?: Date
  }
): Promise<void> {
  const now = dbType === 'postgres' ? new Date() : new Date().toISOString()

  const summaryValue =
    dbType === 'postgres' ? data.summary : data.summary ? JSON.stringify(data.summary) : null

  const parseStartedAt = data.parseStartedAt
    ? dbType === 'postgres'
      ? data.parseStartedAt
      : data.parseStartedAt.toISOString()
    : null
  const parseCompletedAt = data.parseCompletedAt
    ? dbType === 'postgres'
      ? data.parseCompletedAt
      : data.parseCompletedAt.toISOString()
    : null

  const openingBalanceValue =
    data.openingBalance != null
      ? dbType === 'postgres'
        ? data.openingBalance.toString()
        : data.openingBalance
      : null
  const closingBalanceValue =
    data.closingBalance != null
      ? dbType === 'postgres'
        ? data.closingBalance.toString()
        : data.closingBalance
      : null

  await db
    .update(tables.statements)
    .set({
      periodStart: data.periodStart || null,
      periodEnd: data.periodEnd || null,
      openingBalance: openingBalanceValue as typeof tables.statements.$inferSelect.openingBalance,
      closingBalance: closingBalanceValue as typeof tables.statements.$inferSelect.closingBalance,
      summary: summaryValue as typeof tables.statements.$inferSelect.summary,
      transactionCount: data.transactionCount,
      parseStartedAt: parseStartedAt as Date,
      parseCompletedAt: parseCompletedAt as Date,
      status: 'completed',
      updatedAt: now as Date,
    })
    .where(eq(tables.statements.id, statementId))
}

export interface StatementDetailsUpdate {
  periodStart?: string | null
  periodEnd?: string | null
  /** Bank statements */
  openingBalance?: number | null
  closingBalance?: number | null
  /** Credit card statements: also stored as the closing balance, which drives the card's outstanding */
  totalDue?: number | null
}

/**
 * Edit the period and balances of a completed bank/credit card statement
 */
export async function updateStatementDetails(
  statementId: string,
  userId: string,
  data: StatementDetailsUpdate
): Promise<StatementResponse> {
  const statement = await getStatementById(statementId, userId)
  if (!statement) throw new Error('Statement not found')
  if (statement.documentType === 'investment_statement') {
    throw new Error('Investment statements cannot be edited')
  }

  const periodStart = data.periodStart !== undefined ? data.periodStart : statement.periodStart
  const periodEnd = data.periodEnd !== undefined ? data.periodEnd : statement.periodEnd
  if (periodStart && periodEnd && periodStart > periodEnd) {
    throw new Error('Period start must be on or before period end')
  }

  const toDbNumber = (value: number | null) =>
    value == null ? null : dbType === 'postgres' ? value.toString() : value

  const updates: Partial<typeof tables.statements.$inferInsert> = {
    periodStart: periodStart || null,
    periodEnd: periodEnd || null,
    updatedAt: (dbType === 'postgres' ? new Date() : new Date().toISOString()) as Date,
  }
  let summary = statement.summary

  if (data.totalDue !== undefined) {
    // Credit card: the total due is the outstanding balance
    updates.closingBalance = toDbNumber(
      data.totalDue
    ) as typeof tables.statements.$inferSelect.closingBalance
    const base = summary?.type === 'credit_card_statement' ? summary : null
    summary = {
      ...base,
      type: 'credit_card_statement',
      totalDue: data.totalDue ?? undefined,
    }
  } else {
    if (data.openingBalance !== undefined) {
      updates.openingBalance = toDbNumber(
        data.openingBalance
      ) as typeof tables.statements.$inferSelect.openingBalance
    }
    if (data.closingBalance !== undefined) {
      updates.closingBalance = toDbNumber(
        data.closingBalance
      ) as typeof tables.statements.$inferSelect.closingBalance
    }
    if (summary?.type === 'bank_statement') {
      summary = {
        ...summary,
        openingBalance:
          data.openingBalance !== undefined
            ? (data.openingBalance ?? undefined)
            : summary.openingBalance,
        closingBalance:
          data.closingBalance !== undefined
            ? (data.closingBalance ?? undefined)
            : summary.closingBalance,
      }
    }
  }

  if (summary !== statement.summary) {
    updates.summary = (
      dbType === 'postgres' ? summary : JSON.stringify(summary)
    ) as typeof tables.statements.$inferSelect.summary
  }

  await db.update(tables.statements).set(updates).where(eq(tables.statements.id, statementId))

  const updated = await getStatementById(statementId, userId)
  if (!updated) throw new Error('Statement not found')
  return updated
}

export async function deleteStatement(statementId: string, userId: string): Promise<void> {
  const statement = await getStatementById(statementId, userId)
  if (!statement) throw new Error('Statement not found')

  await db.delete(tables.statements).where(eq(tables.statements.id, statementId))
}

// ============================================================================
// SIMPLE ASYNC PROCESSING
// ============================================================================

// Flag to prevent concurrent processing
let isProcessing = false
// Queue of jobs waiting to be processed
const processingQueue: Array<{
  statements: StatementInput[]
  countryCode: CountryCode
  categorizationModel?: string
  categorizationHints?: string
}> = []

// Categorization status tracking
let categorizationStatus: {
  active: boolean
  type: 'parsing' | 'categorizing' | 'recategorizing' | null
  progress?: { current: number; total: number }
} = { active: false, type: null }

/**
 * Get current categorization status
 */
export function getCategorizationStatus() {
  return { ...categorizationStatus }
}

/**
 * Queue statements for processing (async, non-blocking)
 * Returns immediately, processing happens in background
 */
export function queueStatements(data: {
  statements: StatementInput[]
  countryCode: CountryCode
  categorizationModel?: string
  categorizationHints?: string
}): void {
  processingQueue.push(data)
  logger.debug(`[Statement] Queued ${data.statements.length} statements for processing`)
  processQueue()
}

/**
 * Process the queue - one job at a time
 */
async function processQueue(): Promise<void> {
  if (isProcessing) return

  const job = processingQueue.shift()
  if (!job) return

  isProcessing = true

  try {
    await processStatements(
      job.statements,
      job.countryCode,
      job.categorizationModel,
      job.categorizationHints
    )
  } catch (error) {
    logger.error('[Statement] Processing failed:', error)
  } finally {
    isProcessing = false
    processQueue() // Process next job if any
  }
}

/**
 * Mark a statement as failed and remove any partially inserted transactions
 */
async function failStatementAndCleanup(statementId: string, errorMessage: string): Promise<void> {
  await updateStatementStatus(statementId, 'failed', errorMessage)
  await db.delete(tables.transactions).where(eq(tables.transactions.statementId, statementId))
}

/**
 * Categorize all transactions of the given statements (one account), then link entities
 */
async function categorizeAndLinkAccount(params: {
  accountId: string | null
  statementIds: string[]
  profileId?: string
  userId?: string
  countryCode: CountryCode
  categorizationModel?: string
  categorizationHints?: string
}): Promise<void> {
  const { categorizeStatements } = await import('../lib/pdf')
  const { linkEntitiesForAccount } = await import('./entity-linking')
  const { accountId, statementIds, profileId, userId, countryCode } = params
  const label = accountId ?? 'no-account'

  try {
    const result = await categorizeStatements(
      statementIds,
      countryCode,
      params.categorizationModel,
      undefined,
      profileId,
      params.categorizationHints
    )
    logger.debug(
      `[Statement] Categorized ${result.categorizedCount}/${result.totalCount} transactions for account ${label}`
    )

    // Run entity linking for this account after categorization
    if (accountId && userId) {
      try {
        await linkEntitiesForAccount(accountId, userId, params.categorizationModel)
        logger.debug(`[Statement] Entity linking completed for account ${label}`)
      } catch (linkError) {
        logger.error(`[Statement] Entity linking failed for account ${label}:`, linkError)
      }
    }
  } catch (error) {
    logger.error(`[Statement] Categorization failed for account ${label}:`, error)
  }
}

/**
 * Process statements: parse serially, then categorize per account, then run entity linking
 */
async function processStatements(
  statements: StatementInput[],
  countryCode: CountryCode,
  categorizationModel?: string,
  categorizationHints?: string
): Promise<void> {
  const { parseStatement } = await import('../llm/parser')
  const { updateStatementPassword } = await import('./accounts')

  const successfulStatements: Array<{
    statementId: string
    accountId: string | null
    profileId: string
    userId: string
  }> = []

  // Step 1: Parse each statement serially (for caching benefits)
  logger.debug(`[Statement] Parsing ${statements.length} statements serially`)
  categorizationStatus = {
    active: true,
    type: 'parsing',
    progress: { current: 0, total: statements.length },
  }

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]!
    categorizationStatus.progress = { current: i + 1, total: statements.length }
    logger.debug(`[Statement] Parsing ${i + 1}/${statements.length}: ${stmt.statementId}`)

    try {
      await updateStatementStatus(stmt.statementId, 'parsing')

      await parseStatement({
        statementId: stmt.statementId,
        profileId: stmt.profileId,
        userId: stmt.userId,
        countryCode,
        pages: stmt.pages,
        fileType: stmt.fileType,
        documentType: stmt.documentType,
        sourceType: stmt.sourceType,
        parsingModel: stmt.parsingModel,
      })

      // Get the account ID for this statement
      const [parsedStatement] = await db
        .select({ accountId: tables.statements.accountId })
        .from(tables.statements)
        .where(eq(tables.statements.id, stmt.statementId))
        .limit(1)

      successfulStatements.push({
        statementId: stmt.statementId,
        accountId: parsedStatement?.accountId || null,
        profileId: stmt.profileId,
        userId: stmt.userId,
      })

      // Save password to account if requested (after parsing, account is now created)
      if (stmt.password && stmt.savePassword && parsedStatement?.accountId) {
        await updateStatementPassword(parsedStatement.accountId, stmt.userId, stmt.password)
        logger.debug(`[Statement] Saved password for account ${parsedStatement.accountId}`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error(`[Statement] Failed to parse ${stmt.statementId}:`, errorMessage)
      await failStatementAndCleanup(stmt.statementId, errorMessage)
    }
  }

  logger.debug(
    `[Statement] Parsing complete: ${successfulStatements.length}/${statements.length} succeeded`
  )

  // Step 2: Group statements by accountId and categorize per account
  if (successfulStatements.length > 0) {
    // Group by accountId
    const accountGroups = new Map<string, typeof successfulStatements>()
    for (const stmt of successfulStatements) {
      const key = stmt.accountId || 'no-account'
      if (!accountGroups.has(key)) {
        accountGroups.set(key, [])
      }
      accountGroups.get(key)!.push(stmt)
    }

    logger.debug(`[Statement] Categorizing ${accountGroups.size} account groups`)
    categorizationStatus = { active: true, type: 'categorizing' }

    // Process each account group
    for (const [accountId, accountStatements] of accountGroups) {
      const statementIds = accountStatements.map((s) => s.statementId)
      const profileId = accountStatements[0]?.profileId
      const userId = accountStatements[0]?.userId

      logger.debug(
        `[Statement] Categorizing account ${accountId}: ${statementIds.length} statements`
      )

      await categorizeAndLinkAccount({
        accountId: accountId === 'no-account' ? null : accountId,
        statementIds,
        profileId,
        userId,
        countryCode,
        categorizationModel,
        categorizationHints,
      })
    }
  }

  categorizationStatus = { active: false, type: null }
}

// ============================================================================
// STARTUP RECOVERY
// ============================================================================

/**
 * Fail statements left 'pending'/'parsing' by an interrupted run and drop their
 * partial transactions. Returns the number of statements recovered.
 */
async function failInterruptedStatements(): Promise<number> {
  const interrupted = await db
    .select({ id: tables.statements.id })
    .from(tables.statements)
    .where(inArray(tables.statements.status, ['pending', 'parsing']))

  for (const stmt of interrupted) {
    await failStatementAndCleanup(stmt.id, INTERRUPTED_STATEMENT_MESSAGE)
  }
  return interrupted.length
}

/**
 * Delete 'Pending - <file>' placeholder accounts that nothing needs any more.
 * Failed statements still pointing at a placeholder are detached first (accountId is
 * nullable), since deleting the account would cascade-delete the failed statement the
 * user needs to see and remove.
 */
async function deleteOrphanPlaceholderAccounts(): Promise<number> {
  const candidates = await db
    .select({ id: tables.accounts.id, name: tables.accounts.accountName })
    .from(tables.accounts)
    .where(like(tables.accounts.accountName, `${PLACEHOLDER_ACCOUNT_PREFIX}%`))
  if (candidates.length === 0) return 0
  const ids = candidates.map((a) => a.id)

  await db
    .update(tables.statements)
    .set({ accountId: null })
    .where(and(eq(tables.statements.status, 'failed'), inArray(tables.statements.accountId, ids)))

  const stmtRefs = await db
    .selectDistinct({ accountId: tables.statements.accountId })
    .from(tables.statements)
    .where(inArray(tables.statements.accountId, ids))
  const txnRefs = await db
    .selectDistinct({ accountId: tables.transactions.accountId })
    .from(tables.transactions)
    .where(inArray(tables.transactions.accountId, ids))

  const orphanIds = findOrphanPlaceholderAccountIds(
    candidates,
    new Set(stmtRefs.map((r) => r.accountId).filter((id): id is string => !!id)),
    new Set(txnRefs.map((r) => r.accountId))
  )
  if (orphanIds.length > 0) {
    await db.delete(tables.accounts).where(inArray(tables.accounts.id, orphanIds))
  }
  return orphanIds.length
}

/**
 * Find completed bank/credit card statements that still have uncategorized
 * transactions (summary IS NULL), grouped by account.
 */
async function findUncategorizedAccountGroups(): Promise<UncategorizedAccountGroup[]> {
  const rows = await db
    .selectDistinct({
      statementId: tables.statements.id,
      documentType: tables.statements.documentType,
      accountId: tables.transactions.accountId,
      userId: tables.statements.userId,
      profileId: tables.statements.profileId,
    })
    .from(tables.statements)
    .innerJoin(tables.transactions, eq(tables.transactions.statementId, tables.statements.id))
    .where(and(eq(tables.statements.status, 'completed'), isNull(tables.transactions.summary)))

  return groupByAccount(rows.filter((r) => isCategorizableDocumentType(r.documentType)))
}

/**
 * Categorize leftover uncategorized transactions in the background, one account at a time
 */
async function recoverUncategorizedTransactions(
  groups: UncategorizedAccountGroup[]
): Promise<void> {
  const { findUserById } = await import('./user')
  const { getPreference, PREFERENCE_KEYS } = await import('./preferences')

  categorizationStatus = {
    active: true,
    type: 'categorizing',
    progress: { current: 0, total: groups.length },
  }

  try {
    for (const [index, group] of groups.entries()) {
      categorizationStatus.progress = { current: index + 1, total: groups.length }

      const user = await findUserById(group.userId)
      if (!user?.country) {
        logger.warn(`[Recovery] Skipping account ${group.accountId}: user country not set`)
        continue
      }

      // Same defaults the upload form prefills: the saved categorization model (unset falls
      // back to the first configured provider) and the account's hints, else the default hints
      const provider = await getPreference(
        group.userId,
        PREFERENCE_KEYS.STATEMENT_CATEGORISATION_PROVIDER,
        group.profileId
      )
      const model = await getPreference(
        group.userId,
        PREFERENCE_KEYS.STATEMENT_CATEGORISATION_MODEL,
        group.profileId
      )
      const [account] = await db
        .select({ hints: tables.accounts.categorizationHints })
        .from(tables.accounts)
        .where(eq(tables.accounts.id, group.accountId))
        .limit(1)
      // Account hints are applied by the categorizer itself when none are passed
      const defaultHints = account?.hints?.trim()
        ? undefined
        : (
            await getPreference(
              group.userId,
              PREFERENCE_KEYS.DEFAULT_CATEGORIZATION_HINTS,
              group.profileId
            )
          )?.trim() || undefined

      await categorizeAndLinkAccount({
        ...group,
        countryCode: user.country as CountryCode,
        categorizationModel: provider && model ? `${provider}:${model}` : undefined,
        categorizationHints: defaultHints,
      })
    }
  } finally {
    categorizationStatus = { active: false, type: null }
  }
}

/**
 * Recover from an app quit/restart mid-processing. Safe to run on every startup:
 * with nothing interrupted it only runs a few read queries.
 *
 * - 'pending'/'parsing' statements are marked failed and their partial transactions deleted
 * - orphaned 'Pending - <file>' placeholder accounts are deleted
 * - completed statements with uncategorized transactions are re-queued for
 *   categorization in the background (not awaited), skipped if no LLM is configured
 */
export async function recoverInterruptedProcessing(): Promise<void> {
  const failedCount = await failInterruptedStatements()
  const removedAccounts = await deleteOrphanPlaceholderAccounts()
  const groups = await findUncategorizedAccountGroups()

  if (failedCount > 0 || removedAccounts > 0 || groups.length > 0) {
    logger.info(
      `[Recovery] Failed ${failedCount} interrupted statement(s), removed ${removedAccounts} orphan placeholder account(s), ${groups.length} account(s) with uncategorized transactions`
    )
  }
  if (groups.length === 0) return

  const { getLLMSettings } = await import('./config')
  if (!(await getLLMSettings()).isConfigured) {
    logger.warn(
      '[Recovery] No LLM provider configured, skipping categorization of leftover transactions'
    )
    return
  }

  // Run in the background so startup is not blocked
  void recoverUncategorizedTransactions(groups).catch((error) => {
    logger.error('[Recovery] Background categorization failed:', error)
  })
}

// ============================================================================
// RECATEGORIZATION (kept simple)
// ============================================================================

export interface RecategorizeJob {
  id: string
  profileId: string
  userId: string
  countryCode: CountryCode
  accountId?: string
  statementId?: string
  categorizationModel: string
  categorizationHints?: string
  includeManual?: boolean // If true, include manually categorized transactions
  categories?: string[] // If set, only recategorize transactions in these categories
  status: 'pending' | 'processing' | 'completed' | 'failed'
  transactionCount?: number
  processedCount?: number
  errorMessage?: string
  createdAt: Date
  completedAt?: Date
}

const recategorizeJobs: Map<string, RecategorizeJob> = new Map()
let isRecategorizing = false

export function queueRecategorizeJob(data: {
  profileId: string
  userId: string
  countryCode: CountryCode
  accountId?: string
  statementId?: string
  categorizationModel: string
  categorizationHints?: string
  includeManual?: boolean
  categories?: string[]
}): string {
  const jobId = nanoid()

  const job: RecategorizeJob = {
    id: jobId,
    ...data,
    status: 'pending',
    createdAt: new Date(),
  }

  recategorizeJobs.set(jobId, job)
  logger.debug(`[Recategorize] Queued job ${jobId}`)
  processNextRecategorizeJob()

  return jobId
}

async function processNextRecategorizeJob(): Promise<void> {
  if (isRecategorizing) return

  const job = Array.from(recategorizeJobs.values()).find((j) => j.status === 'pending')
  if (!job) return

  isRecategorizing = true
  job.status = 'processing'
  categorizationStatus = { active: true, type: 'recategorizing' }

  try {
    const { recategorizeTransactions } = await import('./recategorize')

    const result = await recategorizeTransactions({
      profileId: job.profileId,
      userId: job.userId,
      countryCode: job.countryCode,
      accountId: job.accountId,
      statementId: job.statementId,
      categorizationModel: job.categorizationModel,
      categorizationHints: job.categorizationHints,
      includeManual: job.includeManual,
      categories: job.categories,
      onProgress: (processed, total) => {
        job.processedCount = processed
        job.transactionCount = total
        categorizationStatus.progress = { current: processed, total }
      },
    })

    job.status = 'completed'
    job.transactionCount = result.totalCount
    job.processedCount = result.categorizedCount
    job.completedAt = new Date()
    logger.debug(
      `[Recategorize] Job ${job.id} completed: ${result.categorizedCount}/${result.totalCount}`
    )
  } catch (error) {
    job.status = 'failed'
    job.errorMessage = error instanceof Error ? error.message : 'Unknown error'
    job.completedAt = new Date()
    logger.error(`[Recategorize] Job ${job.id} failed:`, job.errorMessage)
  } finally {
    isRecategorizing = false
    categorizationStatus = { active: false, type: null }
    processNextRecategorizeJob()
  }
}

export function getRecategorizeJobStatus(jobId: string): RecategorizeJob | undefined {
  return recategorizeJobs.get(jobId)
}
