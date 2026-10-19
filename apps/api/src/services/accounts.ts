import { eq, and, desc, gt, ne } from 'drizzle-orm'
import { db, tables, dbType } from '../db'
import { MANUAL_DOCUMENT_TYPE } from '../lib/manual-statement'
import type { Account } from '../db'
import { encryptOptional, decryptOptional } from '../lib/encryption'
import { getAccountTypesForCountry, type CountryCode } from '../lib/constants'
import { logger } from '../lib/logger'
import { accountNumbersMatch, getLast4 } from '../lib/account-number'
import { getLoanLiabilities, type LoanLiabilityInfo } from './loans'
import { computeCardBalance, type LinkedCardPayment } from './card-balance'

/**
 * Account service
 * Handles CRUD operations for financial accounts
 */

/**
 * Account response type (with decrypted fields)
 */
export interface AccountResponse {
  id: string
  profileId: string
  userId: string
  type: string
  institution: string | null
  accountNumber: string | null // decrypted
  accountName: string | null
  productName: string | null // account product/variant name (e.g., "Regalia", "Savings Max", "Imperia")
  categorizationHints: string | null // saved hints applied to every categorization of this account
  currency: string
  isActive: boolean
  hasStatementPassword: boolean // don't expose actual password
  createdAt: string | Date
  updatedAt: string | Date
}

/**
 * Transform account to response format (decrypt sensitive fields)
 */
function toAccountResponse(account: Account): AccountResponse {
  return {
    id: account.id,
    profileId: account.profileId,
    userId: account.userId,
    type: account.type,
    institution: account.institution,
    accountNumber: decryptOptional(account.accountNumber),
    accountName: account.accountName,
    productName: account.productName ?? null,
    categorizationHints: account.categorizationHints ?? null,
    currency: account.currency,
    isActive: account.isActive,
    hasStatementPassword: !!account.statementPassword,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  }
}

/**
 * Get all accounts for a user
 */
export async function getAccountsByUserId(
  userId: string,
  profileId?: string
): Promise<AccountResponse[]> {
  let query = db.select().from(tables.accounts).where(eq(tables.accounts.userId, userId))

  if (profileId) {
    query = db
      .select()
      .from(tables.accounts)
      .where(and(eq(tables.accounts.userId, userId), eq(tables.accounts.profileId, profileId)))
  }

  const accounts = await query.orderBy(tables.accounts.createdAt)
  return accounts.map(toAccountResponse)
}

/**
 * Account with balance info
 */
export interface AccountWithBalance extends AccountResponse {
  /** Statement closing balance, adjusted for linked card payments made since the statement */
  latestBalance: number | null
  latestStatementDate: string | null
  /** Closing balance as printed on the latest statement */
  statementBalance?: number | null
  /** Total of linked credit card payments made after the statement (0 when none) */
  paymentsSinceStatement?: number
}

/**
 * Latest balance for an account: the closing balance of the most recent completed statement.
 * For credit cards, linked bank payments made after the statement end are subtracted.
 */
async function getLatestAccountBalance(
  account: Pick<Account, 'id' | 'type'>,
  userId: string
): Promise<{
  balance: number | null
  statementBalance: number | null
  paymentsSinceStatement: number
  statementDate: string | null
}> {
  const [latestStatement] = await db
    .select({
      closingBalance: tables.statements.closingBalance,
      periodEnd: tables.statements.periodEnd,
    })
    .from(tables.statements)
    .where(
      and(
        eq(tables.statements.accountId, account.id),
        eq(tables.statements.status, 'completed'),
        // Manual entries have no period or balance (and Postgres sorts NULLs first in DESC)
        ne(tables.statements.documentType, MANUAL_DOCUMENT_TYPE)
      )
    )
    .orderBy(desc(tables.statements.periodEnd))
    .limit(1)

  const statementBalance = latestStatement?.closingBalance
    ? Number(latestStatement.closingBalance)
    : null
  const statementDate = latestStatement?.periodEnd ?? null

  let payments: LinkedCardPayment[] = []
  if (account.type === 'credit_card' && statementBalance !== null && statementDate) {
    const rows = await db
      .select({ date: tables.transactions.date, amount: tables.transactions.amount })
      .from(tables.transactions)
      .where(
        and(
          eq(tables.transactions.userId, userId),
          eq(tables.transactions.linkedEntityType, 'credit_card'),
          eq(tables.transactions.linkedEntityId, account.id),
          eq(tables.transactions.type, 'debit'),
          eq(tables.transactions.isHidden, false),
          gt(tables.transactions.date, statementDate)
        )
      )
    payments = rows.map((r) => ({
      date: String(r.date),
      amount: typeof r.amount === 'string' ? parseFloat(r.amount) : Number(r.amount),
    }))
  }

  const result = computeCardBalance(statementBalance, statementDate, payments)
  return {
    balance: account.type === 'credit_card' ? result.balance : statementBalance,
    statementBalance,
    paymentsSinceStatement: result.paymentsSinceStatement,
    statementDate,
  }
}

/**
 * Get all accounts for a user with their latest balances
 * Balances are derived from the closing balance of the most recent statement
 */
export async function getAccountsWithBalances(
  userId: string,
  profileId?: string
): Promise<AccountWithBalance[]> {
  // Get base accounts
  const accountConditions = [eq(tables.accounts.userId, userId)]
  if (profileId) {
    accountConditions.push(eq(tables.accounts.profileId, profileId))
  }

  const accounts = await db
    .select()
    .from(tables.accounts)
    .where(and(...accountConditions))
    .orderBy(tables.accounts.createdAt)

  // For each account, get the latest statement with a closing balance
  const accountsWithBalances: AccountWithBalance[] = []

  for (const account of accounts) {
    const latest = await getLatestAccountBalance(account, userId)

    accountsWithBalances.push({
      ...toAccountResponse(account),
      latestBalance: latest.balance,
      latestStatementDate: latest.statementDate,
      statementBalance: latest.statementBalance,
      paymentsSinceStatement: latest.paymentsSinceStatement,
    })
  }

  return accountsWithBalances
}

/**
 * Get an account by ID (with user ownership check)
 */
export async function getAccountById(
  accountId: string,
  userId: string
): Promise<AccountResponse | null> {
  const [account] = await db
    .select()
    .from(tables.accounts)
    .where(and(eq(tables.accounts.id, accountId), eq(tables.accounts.userId, userId)))
    .limit(1)

  return account ? toAccountResponse(account) : null
}

/**
 * Get raw account by ID (for internal use, includes encrypted fields)
 */
export async function getAccountByIdRaw(
  accountId: string,
  userId: string
): Promise<Account | null> {
  const [account] = await db
    .select()
    .from(tables.accounts)
    .where(and(eq(tables.accounts.id, accountId), eq(tables.accounts.userId, userId)))
    .limit(1)

  return account || null
}

/**
 * Find an account of the profile whose stored number matches the given (possibly masked) number.
 * See accountNumbersMatch for the rules; institution and type are needed to match on the last 4 only.
 */
export async function findAccountByNumber(
  profileId: string,
  accountNumber: string,
  options: { institution?: string | null; type?: string | null; excludeAccountId?: string } = {}
): Promise<Account | null> {
  const accounts = await db
    .select()
    .from(tables.accounts)
    .where(eq(tables.accounts.profileId, profileId))

  logger.debug(
    `[Account] findAccountByNumber: searching for number ending ${getLast4(accountNumber) ?? '?'} in ${accounts.length} accounts`
  )

  for (const account of accounts) {
    if (account.id === options.excludeAccountId) continue
    const decrypted = decryptOptional(account.accountNumber)
    if (!decrypted) continue

    if (
      accountNumbersMatch(
        { accountNumber, institution: options.institution, type: options.type },
        { accountNumber: decrypted, institution: account.institution, type: account.type }
      )
    ) {
      logger.debug(`[Account] Match found: ${account.id}`)
      return account
    }
  }

  logger.debug(`[Account] No match found`)
  return null
}

/**
 * Create a new account
 */
export async function createAccount(data: {
  profileId: string
  userId: string
  type: string
  institution?: string | null
  accountNumber?: string | null
  accountName?: string | null
  productName?: string | null
  currency: string
  statementPassword?: string | null
}): Promise<AccountResponse> {
  const now = dbType === 'postgres' ? new Date() : new Date().toISOString()

  // Encrypt sensitive fields
  const encryptedAccountNumber = encryptOptional(data.accountNumber)
  const encryptedPassword = encryptOptional(data.statementPassword)

  // Generate account name if not provided
  let accountName = data.accountName
  if (!accountName) {
    const typePart = data.type.replace(/_/g, ' ')
    const institutionPart = data.institution ? ` - ${data.institution}` : ''
    const numberPart = data.accountNumber ? ` (****${data.accountNumber.slice(-4)})` : ''
    accountName = `${typePart}${institutionPart}${numberPart}`.trim()
    // Capitalize first letter of each word
    accountName = accountName.replace(/\b\w/g, (c) => c.toUpperCase())
  }

  const [account] = await db
    .insert(tables.accounts)
    .values({
      profileId: data.profileId,
      userId: data.userId,
      type: data.type,
      institution: data.institution || null,
      accountNumber: encryptedAccountNumber,
      accountName,
      productName: data.productName || null,
      currency: data.currency,
      statementPassword: encryptedPassword,
      isActive: true,
      createdAt: now as Date,
      updatedAt: now as Date,
    })
    .returning()

  if (!account) {
    throw new Error('Failed to create account')
  }

  logger.debug(`[Account] Created account ${account.id} for profile ${data.profileId}`)
  return toAccountResponse(account)
}

/**
 * Update an account
 */
export async function updateAccount(
  accountId: string,
  userId: string,
  data: {
    accountName?: string
    productName?: string | null
    institution?: string | null
    categorizationHints?: string | null
    statementPassword?: string | null
    isActive?: boolean
  }
): Promise<AccountResponse> {
  // Verify ownership
  const existingAccount = await getAccountByIdRaw(accountId, userId)
  if (!existingAccount) {
    throw new Error('Account not found')
  }

  const now = dbType === 'postgres' ? new Date() : new Date().toISOString()

  // Build update object
  const updateData: Partial<Account> = {
    updatedAt: now as Date,
  }

  if (data.accountName !== undefined) {
    updateData.accountName = data.accountName
  }

  if (data.productName !== undefined) {
    updateData.productName = data.productName
  }

  if (data.institution !== undefined) {
    updateData.institution = data.institution
  }

  if (data.categorizationHints !== undefined) {
    updateData.categorizationHints = data.categorizationHints?.trim() || null
  }

  if (data.statementPassword !== undefined) {
    updateData.statementPassword = encryptOptional(data.statementPassword)
  }

  if (data.isActive !== undefined) {
    updateData.isActive = data.isActive
  }

  const [updatedAccount] = await db
    .update(tables.accounts)
    .set(updateData)
    .where(eq(tables.accounts.id, accountId))
    .returning()

  if (!updatedAccount) {
    throw new Error('Failed to update account')
  }

  logger.debug(`[Account] Updated account ${accountId}`)
  return toAccountResponse(updatedAccount)
}

/**
 * Delete an account (cascades to statements and transactions)
 */
export async function deleteAccount(accountId: string, userId: string): Promise<void> {
  // Verify ownership
  const existingAccount = await getAccountByIdRaw(accountId, userId)
  if (!existingAccount) {
    throw new Error('Account not found')
  }

  // Unlink any transactions that reference this account as a credit card
  await db
    .update(tables.transactions)
    .set({ linkedEntityId: null, linkedEntityType: null })
    .where(
      and(
        eq(tables.transactions.linkedEntityId, accountId),
        eq(tables.transactions.linkedEntityType, 'credit_card')
      )
    )

  await db.delete(tables.accounts).where(eq(tables.accounts.id, accountId))

  logger.debug(`[Account] Deleted account ${accountId}`)
}

/**
 * Get the decrypted statement password for an account
 */
export async function getStatementPassword(
  accountId: string,
  userId: string
): Promise<string | null> {
  const account = await getAccountByIdRaw(accountId, userId)
  if (!account) {
    throw new Error('Account not found')
  }

  return decryptOptional(account.statementPassword)
}

/**
 * Update statement password for an account
 */
export async function updateStatementPassword(
  accountId: string,
  userId: string,
  password: string | null
): Promise<void> {
  const existingAccount = await getAccountByIdRaw(accountId, userId)
  if (!existingAccount) {
    throw new Error('Account not found')
  }

  const now = dbType === 'postgres' ? new Date() : new Date().toISOString()

  await db
    .update(tables.accounts)
    .set({
      statementPassword: encryptOptional(password),
      updatedAt: now as Date,
    })
    .where(eq(tables.accounts.id, accountId))

  logger.debug(`[Account] Updated statement password for account ${accountId}`)
}

/**
 * Get account types for a country
 */
export function getAccountTypes(countryCode: CountryCode) {
  return getAccountTypesForCountry(countryCode)
}

/**
 * Account balance info for net worth calculation
 */
export interface AccountBalanceInfo {
  accountId: string
  accountName: string | null
  type: string
  institution: string | null
  currency: string
  latestBalance: number | null // adjusted for card payments since the statement
  latestStatementDate: string | null
  statementBalance?: number | null
  paymentsSinceStatement?: number
  isLiability: boolean // true for credit cards (balance = money owed)
}

/**
 * Net worth response
 */
export interface NetWorthResponse {
  totalAssets: number
  totalLiabilities: number
  netWorth: number
  currency: string
  accounts: AccountBalanceInfo[]
  loans: LoanLiabilityInfo[]
  calculatedAt: string
}

// Re-export for convenience
export type { LoanLiabilityInfo }

/**
 * Calculate net worth for a user by summing the latest closing balance from each account
 * Credit card balances and outstanding loan balances are treated as liabilities
 */
export async function calculateNetWorth(
  userId: string,
  profileId?: string
): Promise<NetWorthResponse> {
  // Get all active accounts for the user
  const accountConditions = [eq(tables.accounts.userId, userId), eq(tables.accounts.isActive, true)]
  if (profileId) {
    accountConditions.push(eq(tables.accounts.profileId, profileId))
  }

  const accounts = await db
    .select()
    .from(tables.accounts)
    .where(and(...accountConditions))

  const accountBalances: AccountBalanceInfo[] = []
  let totalAssets = 0
  let totalLiabilities = 0

  // For each account, get the latest statement with a closing balance
  for (const account of accounts) {
    const latest = await getLatestAccountBalance(account, userId)

    const isLiability = account.type === 'credit_card'
    const balance = latest.balance

    accountBalances.push({
      accountId: account.id,
      accountName: account.accountName,
      type: account.type,
      institution: account.institution,
      currency: account.currency,
      latestBalance: balance,
      latestStatementDate: latest.statementDate,
      statementBalance: latest.statementBalance,
      paymentsSinceStatement: latest.paymentsSinceStatement,
      isLiability,
    })

    if (balance !== null) {
      if (isLiability) {
        // Credit card balance is money owed (liability)
        totalLiabilities += balance
      } else {
        // Bank account balance is an asset
        totalAssets += balance
      }
    }
  }

  // Get loan liabilities (outstanding loan balances)
  const loanData = await getLoanLiabilities(userId, profileId)
  totalLiabilities += loanData.totalLoanLiabilities

  // Determine primary currency (use most common, default to INR)
  const currencyCounts = accountBalances.reduce(
    (acc, ab) => {
      acc[ab.currency] = (acc[ab.currency] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )
  const primaryCurrency =
    Object.entries(currencyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'INR'

  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    currency: primaryCurrency,
    accounts: accountBalances,
    loans: loanData.loans,
    calculatedAt: new Date().toISOString(),
  }
}
