import { api } from './axios'

/**
 * User type
 */
export interface User {
  id: string
  email: string | null
  name: string | null
  picture: string | null
  country: string | null
  createdAt?: string
  onboardingComplete?: boolean
}

/**
 * Profile type
 */
export interface Profile {
  id: string
  name: string
  relationship: string | null
  summary: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Country type
 */
export interface Country {
  code: string
  name: string
  currency: string
  currencySymbol: string
}

/**
 * Session type
 */
export interface Session {
  id: string
  current: boolean
  userAgent: string | null
  ipAddress: string | null
  createdAt: string
  lastUsedAt: string
}

/**
 * LLM configured providers map
 */
export interface ConfiguredProviders {
  openai: boolean
  anthropic: boolean
  google: boolean
  ollama: boolean
  vercel: boolean
  openrouter: boolean
}

/**
 * Setup status
 */
export interface SetupStatus {
  authEnabled: boolean
  llm: {
    isConfigured: boolean
    ollamaBaseUrl: string | null
    configuredProviders: ConfiguredProviders
  }
  providers: Array<{
    id: string
    name: string
    models: AIModel[]
    requiresApiKey: boolean
    isConfigured: boolean
  }>
}

/**
 * Auth status (unauthenticated endpoint)
 */
export interface AuthStatus {
  authEnabled: boolean
}

/**
 * Get auth status - unauthenticated, used for initial app load
 */
export async function getAuthStatus(): Promise<AuthStatus> {
  const response = await api.get('/setup/auth')
  return response.data
}

/**
 * Get setup status (requires authentication)
 */
export async function getSetupStatus(): Promise<SetupStatus> {
  const response = await api.get('/setup')
  return response.data
}

/**
 * Update setup configuration (PATCH /setup)
 * Note: Google OAuth must be configured via environment variables
 */
export async function updateSetup(data: {
  llm?: {
    ollamaBaseUrl?: string | null
    openaiApiKey?: string | null
    anthropicApiKey?: string | null
    googleAiApiKey?: string | null
    vercelApiKey?: string | null
    openrouterApiKey?: string | null
  }
}): Promise<SetupStatus> {
  const response = await api.patch('/setup', data)
  return response.data
}

/**
 * Local mode login (for AUTH_ENABLED=false)
 */
export async function localLogin(): Promise<{
  success: boolean
  type: string
  user: { id: string; name: string | null; email: string | null }
}> {
  const response = await api.post('/auth/local')
  return response.data
}

// ============================================
// PIN Authentication API (Local Mode)
// ============================================

/**
 * PIN status response
 */
export interface PinStatus {
  configured: boolean
}

/**
 * PIN verification failure response
 */
export interface PinVerifyFailure {
  success: false
  error: string
  retryAfter?: number
  attemptsRemaining?: number
}

/**
 * Get PIN status - check if PIN is configured (unauthenticated)
 */
export async function getPinStatus(): Promise<PinStatus> {
  const response = await api.get('/auth/pin/status')
  return response.data
}

/**
 * Setup PIN for the first time
 * Returns backup code that user must save
 */
export async function setupPin(pin: string): Promise<{ success: true; backupCode: string }> {
  const response = await api.post('/auth/pin/setup', { pin })
  return response.data
}

/**
 * Verify PIN and create session
 */
export async function verifyPin(pin: string): Promise<{ success: true } | PinVerifyFailure> {
  try {
    const response = await api.post('/auth/pin/verify', { pin })
    return response.data
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response?: { data?: PinVerifyFailure } }
      if (axiosError.response?.data) {
        return axiosError.response.data
      }
    }
    throw error
  }
}

/**
 * Recover PIN using backup code
 * Returns new backup code
 */
export async function recoverPin(
  backupCode: string,
  newPin: string
): Promise<{ success: true; backupCode: string } | PinVerifyFailure> {
  try {
    const response = await api.post('/auth/pin/recover', { backupCode, newPin })
    return response.data
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response?: { data?: PinVerifyFailure } }
      if (axiosError.response?.data) {
        return axiosError.response.data
      }
    }
    throw error
  }
}

/**
 * Change PIN (requires current PIN and valid session)
 */
export async function changePin(
  currentPin: string,
  newPin: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await api.post('/auth/pin/change', { currentPin, newPin })
    return response.data
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response?: { data?: { success: false; error: string } } }
      if (axiosError.response?.data) {
        return axiosError.response.data
      }
    }
    throw error
  }
}

/**
 * Regenerate backup code (requires valid session AND PIN verification)
 */
export async function regenerateBackupCode(
  pin: string
): Promise<
  | { success: true; backupCode: string }
  | { success: false; error: string; retryAfter?: number; attemptsRemaining?: number }
> {
  const response = await api.post('/auth/pin/regenerate-backup', { pin })
  return response.data
}

/**
 * Get Google OAuth URL
 */
export async function getGoogleAuthUrl(
  redirect?: string
): Promise<{ url: string; state: unknown }> {
  const params = new URLSearchParams()
  if (redirect) params.set('redirect', redirect)

  const response = await api.get(`/auth/google?${params.toString()}`)
  return response.data
}

/**
 * Exchange OAuth code for session
 */
export async function exchangeOAuthCode(
  code: string,
  state: string
): Promise<{
  success: boolean
  type: string
  isNewUser?: boolean
  redirectUrl?: string
}> {
  const response = await api.post('/auth/google/exchange', { code, state })
  return response.data
}

/**
 * Get current user
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const response = await api.get('/user/me')
    return response.data
  } catch {
    return null
  }
}

/**
 * Logout
 */
export async function logout(): Promise<void> {
  await api.post('/auth/logout')
}

/**
 * Get user sessions
 */
export async function getUserSessions(): Promise<Session[]> {
  const response = await api.get('/auth/sessions')
  return response.data.sessions
}

/**
 * Revoke a session
 */
export async function revokeSession(sessionId: string): Promise<void> {
  await api.delete(`/auth/sessions/${sessionId}`)
}

/**
 * Revoke all other sessions
 */
export async function revokeOtherSessions(): Promise<{ revokedCount: number }> {
  const response = await api.delete('/auth/sessions')
  return response.data
}

/**
 * Delete account
 */
export async function deleteAccount(): Promise<void> {
  await api.delete('/auth/account', { data: { confirmation: 'DELETE' } })
}

// ============================================
// User / Onboarding API
// ============================================

/**
 * Get supported countries
 */
export async function getCountries(): Promise<Country[]> {
  const response = await api.get('/setup/countries')
  return response.data.countries
}

/**
 * Set user's country during onboarding
 */
export async function setUserCountry(country: string): Promise<User> {
  const response = await api.post('/user/onboarding', { country })
  return response.data.user
}

/**
 * Get current user details
 */
export async function getUserDetails(): Promise<User> {
  const response = await api.get('/user/me')
  return response.data.user
}

// ============================================
// Profile API
// ============================================

/**
 * Get all profiles for the current user
 */
export async function getProfiles(): Promise<Profile[]> {
  const response = await api.get('/profiles')
  return response.data.profiles
}

/**
 * Get a specific profile
 */
export async function getProfile(profileId: string): Promise<Profile> {
  const response = await api.get(`/profiles/${profileId}`)
  return response.data.profile
}

/**
 * Create a new profile
 */
export async function createProfile(data: {
  name: string
  relationship?: string | null
  summary?: string | null
}): Promise<Profile> {
  const response = await api.post('/profiles', data)
  return response.data.profile
}

/**
 * Update a profile
 */
export async function updateProfile(
  profileId: string,
  data: {
    name?: string
    relationship?: string | null
    summary?: string | null
  }
): Promise<Profile> {
  const response = await api.patch(`/profiles/${profileId}`, data)
  return response.data.profile
}

/**
 * Delete a profile
 */
export async function deleteProfile(profileId: string): Promise<void> {
  await api.delete(`/profiles/${profileId}`)
}

// ============================================
// LLM Settings API
// ============================================

/**
 * LLM Settings type
 */
export interface LLMSettings {
  ollamaBaseUrl: string | null
  hasOpenaiApiKey: boolean
  hasAnthropicApiKey: boolean
  hasGoogleAiApiKey: boolean
  hasVercelApiKey: boolean
  hasOpenrouterApiKey: boolean
  isConfigured: boolean
}

/**
 * AI Model type
 */
export interface AIModel {
  id: string
  name: string
  /** Model is capable of parsing statements (requires tool use, code generation) */
  supportsParsing?: boolean
  /** Recommended model for parsing statements */
  recommendedForParsing?: boolean
  /** Recommended model for categorization */
  recommendedForCategorization?: boolean
  supportsThinking?: boolean
  reasoningBuiltIn?: boolean
}

/**
 * LLM Provider info
 */
export interface LLMProvider {
  code: string
  label: string
  models: AIModel[]
  requiresApiKey: boolean
  isConfigured: boolean
}

/**
 * LLM Test result
 */
export interface LLMTestResult {
  success: boolean
  provider?: string
  model?: string
  response?: string
  latencyMs?: number
  error?: string
  message?: string
}

/**
 * Get LLM settings
 */
export async function getLLMSettings(): Promise<LLMSettings> {
  const response = await api.get('/llm/settings')
  return response.data
}

/**
 * Update LLM settings (API keys only)
 */
export async function updateLLMSettings(data: {
  ollamaBaseUrl?: string | null
  openaiApiKey?: string | null
  anthropicApiKey?: string | null
  googleAiApiKey?: string | null
  vercelApiKey?: string | null
  openrouterApiKey?: string | null
}): Promise<LLMSettings> {
  const response = await api.put('/llm/settings', data)
  return response.data
}

/**
 * Get available LLM providers
 */
export async function getLLMProviders(): Promise<LLMProvider[]> {
  const response = await api.get('/llm/providers')
  return response.data.providers
}

/**
 * Test LLM connection
 */
export async function testLLMConnection(params: {
  provider: string
  model: string
  apiKey?: string
  ollamaBaseUrl?: string
}): Promise<LLMTestResult> {
  const response = await api.post('/llm/test', params)
  return response.data
}

/**
 * Ollama custom model
 */
export interface OllamaModel {
  id: string
  name: string
  supportsThinking?: boolean
}

/**
 * Get custom Ollama models
 */
export async function getOllamaModels(): Promise<OllamaModel[]> {
  const response = await api.get('/llm/ollama/models')
  return response.data.models
}

/**
 * Add or update a custom Ollama model
 */
export async function addOllamaModel(model: OllamaModel): Promise<OllamaModel[]> {
  const response = await api.post('/llm/ollama/models', model)
  return response.data.models
}

/**
 * Remove a custom Ollama model
 */
export async function removeOllamaModel(modelId: string): Promise<OllamaModel[]> {
  const response = await api.delete(`/llm/ollama/models/${encodeURIComponent(modelId)}`)
  return response.data.models
}

// ============================================
// Accounts API
// ============================================

/**
 * Account type
 */
export interface Account {
  id: string
  profileId: string
  userId: string
  type: string
  institution: string | null
  accountNumber: string | null
  accountName: string | null
  /** Account product/variant name (e.g., "Regalia", "Savings Max", "Imperia") */
  productName: string | null
  /** Saved hints applied to every categorization of this account */
  categorizationHints: string | null
  currency: string
  isActive: boolean
  hasStatementPassword: boolean
  createdAt: string
  updatedAt: string
  /** Latest balance from the most recent statement */
  latestBalance: number | null
  /** Date of the latest statement (YYYY-MM-DD) */
  latestStatementDate: string | null
  /** Closing balance as printed on the latest statement */
  statementBalance?: number | null
  /** Credit card payments made after the latest statement (0 when none) */
  paymentsSinceStatement?: number
}

/**
 * Account type option
 */
export interface AccountType {
  code: string
  label: string
}

/**
 * Get all accounts
 */
export async function getAccounts(profileId?: string): Promise<Account[]> {
  const params = profileId ? `?profileId=${profileId}` : ''
  const response = await api.get(`/accounts${params}`)
  return response.data.accounts
}

/**
 * Get account by ID
 */
export async function getAccount(accountId: string): Promise<Account> {
  const response = await api.get(`/accounts/${accountId}`)
  return response.data.account
}

/**
 * Get account types for user's country
 */
export async function getAccountTypes(): Promise<AccountType[]> {
  const response = await api.get('/accounts/types')
  return response.data.accountTypes
}

/**
 * Create an account
 */
export async function createAccount(data: {
  profileId: string
  type: string
  currency: string
  institution?: string | null
  accountNumber?: string | null
  accountName?: string | null
  statementPassword?: string | null
}): Promise<Account> {
  const response = await api.post('/accounts', data)
  return response.data.account
}

/**
 * Update an account
 */
export async function updateAccount(
  accountId: string,
  data: {
    accountName?: string
    productName?: string | null
    institution?: string | null
    categorizationHints?: string | null
    statementPassword?: string | null
    isActive?: boolean
  }
): Promise<Account> {
  const response = await api.patch(`/accounts/${accountId}`, data)
  return response.data.account
}

/**
 * Delete a financial account
 */
export async function deleteFinancialAccount(accountId: string): Promise<void> {
  await api.delete(`/accounts/${accountId}`)
}

// ============================================
// Statements API
// ============================================

/**
 * Statement type
 */
export interface Statement {
  id: string
  accountId: string | null
  sourceId: string | null
  profileId: string
  userId: string
  documentType: 'bank_statement' | 'credit_card_statement' | 'investment_statement' | null
  originalFilename: string
  fileType: string
  fileSizeBytes: number | null
  periodStart: string | null
  periodEnd: string | null
  openingBalance: number | null
  closingBalance: number | null
  status: 'pending' | 'parsing' | 'completed' | 'failed'
  errorMessage: string | null
  summary: Record<string, unknown> | null
  transactionCount: number
  /** Transactions deleted after parsing */
  deletedTransactionCount: number
  holdingsCount: number | null
  createdAt: string
  updatedAt: string
}

/**
 * Statement upload response
 */
export interface StatementUploadResponse {
  statement: Statement
  accountId: string
  isNewAccount: boolean
}

/**
 * Get all statements
 */
export async function getStatements(profileId?: string, accountId?: string): Promise<Statement[]> {
  const params = new URLSearchParams()
  if (profileId) params.set('profileId', profileId)
  if (accountId) params.set('accountId', accountId)
  const queryString = params.toString() ? `?${params.toString()}` : ''
  const response = await api.get(`/statements${queryString}`)
  return response.data.statements
}

/**
 * Get statement by ID
 */
export async function getStatement(statementId: string): Promise<Statement> {
  const response = await api.get(`/statements/${statementId}`)
  return response.data.statement
}

/**
 * Get statement status
 */
export async function getStatementStatus(
  statementId: string
): Promise<{ status: string; errorMessage?: string; transactionCount?: number }> {
  const response = await api.get(`/statements/${statementId}/status`)
  return response.data
}

/**
 * Upload response for multiple files
 */
export interface StatementsUploadResponse {
  statementIds: string[]
  status: 'pending'
  processedCount: number
  errors?: Array<{ filename: string; error: string }>
}

/**
 * Upload one or more statements
 */
export async function uploadStatements(
  files: File[],
  profileId: string,
  options?: {
    /** Document type: bank_statement or investment_statement */
    documentType?: 'bank_statement' | 'investment_statement'
    /** For bank statements: existing account ID (optional, auto-detect if not provided) */
    accountId?: string
    /** For investment statements: source type (e.g., zerodha, groww, mf_central) */
    sourceType?: string
    password?: string
    savePassword?: boolean
    /** Provider for statement parsing */
    parsingProvider?: string
    /** Model for statement parsing (code generation) */
    parsingModel?: string
    /** Provider for transaction categorization */
    categorizationProvider?: string
    /** Model for transaction categorization */
    categorizationModel?: string
    /** Custom hints for categorization (e.g., "FX transactions are investments") */
    categorizationHints?: string
  }
): Promise<StatementsUploadResponse> {
  const formData = new FormData()
  for (const file of files) {
    formData.append('files', file)
  }
  formData.append('profileId', profileId)
  if (options?.documentType) formData.append('documentType', options.documentType)
  if (options?.accountId) formData.append('accountId', options.accountId)
  if (options?.sourceType) formData.append('sourceType', options.sourceType)
  if (options?.password) formData.append('password', options.password)
  if (options?.savePassword !== undefined)
    formData.append('savePassword', String(options.savePassword))
  // Combine provider and model in format "provider:model" for backend
  if (options?.parsingProvider && options?.parsingModel) {
    formData.append('parsingModel', `${options.parsingProvider}:${options.parsingModel}`)
  }
  if (options?.categorizationProvider && options?.categorizationModel) {
    formData.append(
      'categorizationModel',
      `${options.categorizationProvider}:${options.categorizationModel}`
    )
  }
  if (options?.categorizationHints) {
    formData.append('categorizationHints', options.categorizationHints)
  }

  const response = await api.post('/statements/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

/**
 * Edit a statement's period and balances (totalDue for credit cards)
 */
export async function updateStatement(
  statementId: string,
  data: {
    periodStart?: string | null
    periodEnd?: string | null
    openingBalance?: number | null
    closingBalance?: number | null
    totalDue?: number | null
  }
): Promise<Statement> {
  const response = await api.patch(`/statements/${statementId}`, data)
  return response.data.statement
}

/**
 * Delete a statement
 */
export async function deleteStatement(statementId: string): Promise<void> {
  await api.delete(`/statements/${statementId}`)
}

// ============================================
// Transactions API
// ============================================

/**
 * Transaction type
 */
export interface Transaction {
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
  createdAt: string
  updatedAt: string
}

/**
 * Transaction filters
 */
export interface TransactionFilters {
  profileId?: string
  accountId?: string[]
  statementId?: string[]
  category?: string[]
  type?: 'credit' | 'debit'
  startDate?: string
  endDate?: string
  search?: string
  minAmount?: number
  maxAmount?: number
  isSubscription?: boolean
  includeHidden?: boolean
  onlyHidden?: boolean
  /** Review queues: never categorized ('pending'), only in the fallback 'other' category, low model confidence on a larger amount ('low_confidence'), or pending/other ('all') */
  reviewStatus?: 'pending' | 'other' | 'low_confidence' | 'all'
}

/**
 * Transaction pagination
 */
export interface TransactionPagination {
  page?: number
  limit?: number
  sortBy?: 'date' | 'amount' | 'createdAt'
  sortOrder?: 'asc' | 'desc'
}

/**
 * Transaction list response
 */
export interface TransactionListResponse {
  transactions: Transaction[]
  total: number
  page: number
  limit: number
}

/**
 * Transaction stats
 */
export interface TransactionStats {
  totalCredits: number
  totalDebits: number
  creditCount: number
  debitCount: number
  netAmount: number
  currency: string
}

/**
 * Category kind: how a category is treated in cash flow
 */
export type CategoryKind = 'income' | 'expense' | 'investment' | 'transfer'

/**
 * Category type
 */
export interface Category {
  code: string
  label: string
  color: string
  kind: CategoryKind
}

/**
 * Build the query string params for the transaction filters
 */
function buildFilterParams(filters?: TransactionFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters?.profileId) params.set('profileId', filters.profileId)
  if (filters?.accountId?.length) params.set('accountId', filters.accountId.join(','))
  if (filters?.statementId?.length) params.set('statementId', filters.statementId.join(','))
  if (filters?.category?.length) params.set('category', filters.category.join(','))
  if (filters?.type) params.set('type', filters.type)
  if (filters?.startDate) params.set('startDate', filters.startDate)
  if (filters?.endDate) params.set('endDate', filters.endDate)
  if (filters?.search) params.set('search', filters.search)
  if (filters?.minAmount !== undefined) params.set('minAmount', String(filters.minAmount))
  if (filters?.maxAmount !== undefined) params.set('maxAmount', String(filters.maxAmount))
  if (filters?.isSubscription !== undefined)
    params.set('isSubscription', String(filters.isSubscription))
  if (filters?.includeHidden) params.set('includeHidden', 'true')
  if (filters?.onlyHidden) params.set('onlyHidden', 'true')
  if (filters?.reviewStatus) params.set('reviewStatus', filters.reviewStatus)
  return params
}

/**
 * Get transactions
 */
export async function getTransactions(
  filters?: TransactionFilters,
  pagination?: TransactionPagination
): Promise<TransactionListResponse> {
  const params = buildFilterParams(filters)
  if (pagination?.page) params.set('page', String(pagination.page))
  if (pagination?.limit) params.set('limit', String(pagination.limit))
  if (pagination?.sortBy) params.set('sortBy', pagination.sortBy)
  if (pagination?.sortOrder) params.set('sortOrder', pagination.sortOrder)

  const queryString = params.toString() ? `?${params.toString()}` : ''
  const response = await api.get(`/transactions${queryString}`)
  return response.data
}

/**
 * Get the IDs of every transaction matching the filters, for "select all matching"
 */
export async function getTransactionIds(
  filters?: TransactionFilters
): Promise<{ ids: string[]; truncated: boolean }> {
  const params = buildFilterParams(filters)
  const queryString = params.toString() ? `?${params.toString()}` : ''
  const response = await api.get(`/transactions/ids${queryString}`)
  return response.data
}

/**
 * Get transaction by ID
 */
export async function getTransaction(transactionId: string): Promise<Transaction> {
  const response = await api.get(`/transactions/${transactionId}`)
  return response.data.transaction
}

/**
 * Update transaction
 */
export async function updateTransaction(
  transactionId: string,
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
): Promise<Transaction> {
  const response = await api.patch(`/transactions/${transactionId}`, data)
  return response.data.transaction
}

/**
 * Add a transaction by hand (cash expense, row missed by the parser)
 */
export async function createTransaction(data: {
  accountId: string
  date: string
  amount: number
  type: 'credit' | 'debit'
  summary: string
  category: string
  isHidden?: boolean
}): Promise<Transaction> {
  const response = await api.post('/transactions', data)
  return response.data.transaction
}

/**
 * Update category, summary and/or hidden state on multiple transactions
 */
export async function bulkUpdateTransactions(data: {
  transactionIds: string[]
  category?: string
  summary?: string
  isHidden?: boolean
  /** Mark the current category as correct without changing it */
  confirmCategory?: true
}): Promise<{ updatedCount: number }> {
  const response = await api.patch('/transactions/bulk', data)
  return response.data
}

/**
 * A rule that sets the name and/or category of transactions whose description contains all terms
 */
export interface TransactionRule {
  id: string
  matchTerms: string[]
  transactionType: 'credit' | 'debit' | null
  /** Inclusive amount limits; null = no limit */
  minAmount: number | null
  maxAmount: number | null
  name: string | null
  category: string | null
  matchCount: number
  createdAt: string
  updatedAt: string
}

/**
 * What a rule matches on
 */
export interface TransactionRuleConditions {
  matchTerms: string[]
  transactionType?: 'credit' | 'debit' | null
  minAmount?: number | null
  maxAmount?: number | null
}

export interface TransactionRuleInput extends TransactionRuleConditions {
  name?: string | null
  category?: string | null
}

export interface TransactionRulePreview {
  count: number
  transactionIds: string[]
  samples: {
    id: string
    date: string
    type: 'credit' | 'debit'
    amount: number
    originalDescription: string
    summary: string | null
    category: string
  }[]
}

/**
 * List the user's transaction rules
 */
export async function getTransactionRules(): Promise<TransactionRule[]> {
  const response = await api.get('/transaction-rules')
  return response.data.rules
}

export async function createTransactionRule(data: TransactionRuleInput): Promise<TransactionRule> {
  const response = await api.post('/transaction-rules', data)
  return response.data.rule
}

export async function updateTransactionRule(
  id: string,
  data: Partial<TransactionRuleInput>
): Promise<TransactionRule> {
  const response = await api.patch(`/transaction-rules/${id}`, data)
  return response.data.rule
}

export async function deleteTransactionRule(id: string): Promise<void> {
  await api.delete(`/transaction-rules/${id}`)
}

/**
 * Find the transactions a set of rule conditions would match
 */
export async function previewTransactionRule(
  data: TransactionRuleConditions
): Promise<TransactionRulePreview> {
  const response = await api.post('/transaction-rules/preview', data)
  return response.data
}

/**
 * A set of transactions that look like the same transaction entered more than once.
 * The first transaction is the oldest-created one (the one to keep).
 */
export interface DuplicateGroup {
  key: string
  signature: string
  transactions: Transaction[]
}

/**
 * Find groups of likely duplicate transactions
 */
export async function getDuplicateGroups(
  filters?: TransactionFilters,
  dismissed = false
): Promise<DuplicateGroup[]> {
  const params = buildFilterParams(filters)
  if (dismissed) params.set('dismissed', 'true')
  const queryString = params.toString()
  const response = await api.get(`/transactions/duplicates${queryString ? `?${queryString}` : ''}`)
  return response.data.groups
}

/**
 * Mark duplicate groups as not duplicates, or bring them back into the list
 */
export async function setDuplicatesDismissed(
  signatures: string[],
  dismissed: boolean
): Promise<void> {
  await api.post('/transactions/duplicates/dismissed', { signatures, dismissed })
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
 * Get the review queue counts for a profile (or everyone when omitted)
 */
export async function getReviewCounts(profileId?: string): Promise<ReviewCounts> {
  const response = await api.get('/transactions/review-counts', { params: { profileId } })
  return response.data
}

/**
 * An SMS transaction that agrees with statement lines on date and amount but not on the merchant
 */
export interface PossibleMatch {
  sms: Transaction
  candidates: Transaction[]
}

export async function getPossibleMatches(profileId?: string): Promise<PossibleMatch[]> {
  const response = await api.get('/transactions/possible-matches', { params: { profileId } })
  return response.data.matches
}

/** Say whether an SMS transaction and a statement line are the same purchase */
export async function resolvePossibleMatch(
  smsTransactionId: string,
  transactionId: string,
  same: boolean
): Promise<void> {
  await api.post(`/transactions/possible-matches/${same ? 'confirm' : 'dismiss'}`, {
    smsTransactionId,
    transactionId,
  })
}

/**
 * Permanently delete multiple transactions
 */
export async function bulkDeleteTransactions(
  transactionIds: string[]
): Promise<{ deletedCount: number }> {
  const response = await api.post('/transactions/bulk-delete', { transactionIds })
  return response.data
}

/**
 * Get transaction stats
 */
export async function getTransactionStats(filters?: {
  profileId?: string
  accountId?: string[]
  statementId?: string[]
  startDate?: string
  endDate?: string
  category?: string[]
  type?: 'credit' | 'debit'
  search?: string
  isSubscription?: boolean
  includeHidden?: boolean
  onlyHidden?: boolean
}): Promise<TransactionStats> {
  const params = new URLSearchParams()
  if (filters?.profileId) params.set('profileId', filters.profileId)
  if (filters?.accountId?.length) params.set('accountId', filters.accountId.join(','))
  if (filters?.statementId?.length) params.set('statementId', filters.statementId.join(','))
  if (filters?.startDate) params.set('startDate', filters.startDate)
  if (filters?.endDate) params.set('endDate', filters.endDate)
  if (filters?.category?.length) params.set('category', filters.category.join(','))
  if (filters?.type) params.set('type', filters.type)
  if (filters?.search) params.set('search', filters.search)
  if (filters?.isSubscription !== undefined)
    params.set('isSubscription', String(filters.isSubscription))
  if (filters?.includeHidden) params.set('includeHidden', 'true')
  if (filters?.onlyHidden) params.set('onlyHidden', 'true')

  const queryString = params.toString() ? `?${params.toString()}` : ''
  const response = await api.get(`/transactions/stats${queryString}`)
  return response.data
}

/**
 * Get categories for user's country
 */
export async function getCategories(): Promise<{
  categories: Category[]
  countryCode: string
  kinds: Record<CategoryKind, string>
}> {
  const response = await api.get('/categories')
  return response.data
}

/**
 * Link transactions
 */
export async function linkTransactions(
  transactionId1: string,
  transactionId2: string,
  linkType: 'payment' | 'transfer' | 'refund'
): Promise<void> {
  await api.post('/transactions/link', { transactionId1, transactionId2, linkType })
}

/**
 * Unlink transaction
 */
export async function unlinkTransaction(transactionId: string): Promise<void> {
  await api.delete(`/transactions/${transactionId}/link`)
}

/**
 * Get link candidates for a transaction
 */
export async function getLinkCandidates(transactionId: string): Promise<Transaction[]> {
  const response = await api.get(`/transactions/${transactionId}/link-candidates`)
  return response.data.candidates
}

/**
 * A card payment candidate: the other side of the payment, or the card a bank debit paid
 */
export type LinkSuggestion =
  | {
      kind: 'transaction'
      transaction: Transaction
      accountName: string
      /** Amount difference in rupees; 0 is an exact match */
      amountDiff: number
      dayDiff: number
      score: number
    }
  | { kind: 'card'; accountId: string; accountName: string; reason: string }

export type LinkState =
  | { kind: 'none' }
  | { kind: 'card'; accountId: string; accountName: string }
  | { kind: 'pair'; transaction: Transaction; accountName: string }

export interface LinkSuggestions {
  linked: LinkState
  candidates: LinkSuggestion[]
  best: LinkSuggestion | null
}

/**
 * Candidates for linking a card payment, best first
 */
export async function getLinkSuggestions(
  transactionId: string,
  category?: string
): Promise<LinkSuggestions> {
  const response = await api.get(`/transactions/${transactionId}/link-suggestions`, {
    params: { category },
  })
  return response.data
}

/**
 * Mark card payment checks as correct (hidden from Data Health), or bring them back
 */
export async function setCardPaymentsDismissed(
  transactionIds: string[],
  dismissed: boolean
): Promise<void> {
  await api.post('/transactions/card-payments/dismissed', { transactionIds, dismissed })
}

// ============================================
// Recategorization API
// ============================================

/**
 * Recategorize job status
 */
export interface RecategorizeJob {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  transactionCount?: number
  processedCount?: number
  errorMessage?: string
  createdAt: string
  completedAt?: string
}

/**
 * Trigger recategorization for an account or statement
 */
export async function recategorizeTransactions(data: {
  profileId: string
  accountId?: string
  statementId?: string
  categorizationProvider: string
  categorizationModel: string
  categorizationHints?: string
  includeManual?: boolean
  categories?: string[]
}): Promise<{ success: boolean; jobId: string; message: string }> {
  // Combine provider and model in format "provider:model" for backend
  const categorizationModel = `${data.categorizationProvider}:${data.categorizationModel}`
  const response = await api.post('/transactions/recategorize', {
    profileId: data.profileId,
    accountId: data.accountId,
    statementId: data.statementId,
    categorizationModel,
    categorizationHints: data.categorizationHints,
    includeManual: data.includeManual,
    categories: data.categories,
  })
  return response.data
}

/**
 * Get recategorization job status
 */
export async function getRecategorizeJobStatus(jobId: string): Promise<RecategorizeJob> {
  const response = await api.get(`/transactions/recategorize/${jobId}`)
  return response.data
}

/**
 * Categorization status
 */
export interface CategorizationStatus {
  active: boolean
  type: 'parsing' | 'categorizing' | 'recategorizing' | null
  progress?: { current: number; total: number }
}

/**
 * Get current categorization status
 */
export async function getCategorizationStatus(): Promise<CategorizationStatus> {
  const response = await api.get('/transactions/categorization-status')
  return response.data
}

// ============================================
// Investments API (Sources, Holdings, Snapshots)
// ============================================

/**
 * Investment source (platform like Zerodha, Groww, etc.)
 */
export interface InvestmentSource {
  id: string
  profileId: string
  userId: string
  sourceType: string
  sourceName: string
  institution: string | null
  accountIdentifier: string | null
  countryCode: string
  currency: string
  lastStatementDate: string | null
  lastSyncAt: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Investment holding (individual security/instrument)
 */
export interface InvestmentHolding {
  id: string
  sourceId: string
  profileId: string
  userId: string
  investmentType: string
  symbol: string | null
  name: string
  isin: string | null
  units: number | null // null for balance-based holdings like PPF, EPF, FD
  averageCost: number | null
  currentPrice: number | null
  currentValue: number
  investedValue: number | null
  gainLoss: number | null
  gainLossPercent: number | null
  currency: string
  asOfDate: string
  folioNumber: string | null
  maturityDate: string | null
  interestRate: number | null
  createdAt: string
  updatedAt: string
}

/**
 * Holding detail in snapshot
 */
export interface SnapshotHoldingDetail {
  symbol: string | null
  name: string
  investmentType: string
  units: number | null // null for balance-based holdings like PPF, EPF, FD
  currentValue: number
  investedValue: number | null
  currency: string
}

/**
 * Investment snapshot (historical point-in-time)
 */
export interface InvestmentSnapshot {
  id: string
  sourceId: string | null
  profileId: string
  userId: string
  snapshotDate: string
  snapshotType: 'statement_import' | 'manual' | 'scheduled'
  totalInvested: number | null
  totalCurrent: number
  totalGainLoss: number | null
  gainLossPercent: number | null
  holdingsCount: number
  holdingsDetail: SnapshotHoldingDetail[] | null
  currency: string
  createdAt: string
}

/**
 * Investment source type option
 */
export interface InvestmentSourceType {
  code: string
  label: string
}

/**
 * Investment holding type option
 */
export interface InvestmentHoldingType {
  code: string
  label: string
}

/**
 * Investment summary (aggregated across all sources)
 */
export interface InvestmentSummary {
  totalInvested: number
  totalCurrent: number
  totalGainLoss: number
  gainLossPercent: number
  holdingsCount: number
  sourcesCount: number
  byType: { type: string; count: number; investedValue: number; currentValue: number }[]
  byCurrency: { currency: string; investedValue: number; currentValue: number }[]
}

/**
 * Get investment types (sources, holdings)
 */
export async function getInvestmentTypes(): Promise<{
  sourceTypes: InvestmentSourceType[]
  holdingTypes: InvestmentHoldingType[]
  countryCode: string
}> {
  const response = await api.get('/investments/types')
  return response.data
}

/**
 * Get investment summary
 */
export async function getInvestmentSummary(profileId?: string): Promise<InvestmentSummary> {
  const params = profileId ? `?profileId=${profileId}` : ''
  const response = await api.get(`/investments/summary${params}`)
  return response.data
}

/**
 * Get all investment sources
 */
export async function getInvestmentSources(profileId?: string): Promise<InvestmentSource[]> {
  const params = profileId ? `?profileId=${profileId}` : ''
  const response = await api.get(`/investments/sources${params}`)
  return response.data.sources
}

/**
 * Get investment source by ID
 */
export async function getInvestmentSource(sourceId: string): Promise<InvestmentSource> {
  const response = await api.get(`/investments/sources/${sourceId}`)
  return response.data.source
}

/**
 * Create an investment source (for manual entry)
 */
export async function createInvestmentSource(data: {
  profileId: string
  sourceType: string
  sourceName: string
  institution?: string | null
  accountIdentifier?: string | null
  countryCode?: string
  currency?: string
}): Promise<InvestmentSource> {
  const response = await api.post('/investments/sources', data)
  return response.data.source
}

/**
 * Update an investment source
 */
export async function updateInvestmentSource(
  sourceId: string,
  data: {
    sourceName?: string
    institution?: string | null
    accountIdentifier?: string | null
    countryCode?: string
    currency?: string
  }
): Promise<InvestmentSource> {
  const response = await api.patch(`/investments/sources/${sourceId}`, data)
  return response.data.source
}

/**
 * Delete an investment source
 */
export async function deleteInvestmentSource(sourceId: string): Promise<void> {
  await api.delete(`/investments/sources/${sourceId}`)
}

/**
 * Get holdings for a source
 */
export async function getHoldingsForSource(sourceId: string): Promise<InvestmentHolding[]> {
  const response = await api.get(`/investments/sources/${sourceId}/holdings`)
  return response.data.holdings
}

/**
 * Get all holdings (across all sources)
 */
export async function getAllHoldings(profileId?: string): Promise<InvestmentHolding[]> {
  const params = profileId ? `?profileId=${profileId}` : ''
  const response = await api.get(`/investments/holdings${params}`)
  return response.data.holdings
}

/**
 * Get holding by ID
 */
export async function getHolding(holdingId: string): Promise<InvestmentHolding> {
  const response = await api.get(`/investments/holdings/${holdingId}`)
  return response.data.holding
}

/**
 * Create a holding (for manual entry)
 */
export async function createHolding(data: {
  sourceId: string
  investmentType: string
  name: string
  units: number | null // null for balance-based holdings like PPF, EPF, FD
  currentValue: number
  currency: string
  asOfDate: string
  symbol?: string | null
  isin?: string | null
  averageCost?: number | null
  currentPrice?: number | null
  investedValue?: number | null
  folioNumber?: string | null
  maturityDate?: string | null
  interestRate?: number | null
}): Promise<InvestmentHolding> {
  const response = await api.post('/investments/holdings', data)
  return response.data.holding
}

/**
 * Update a holding
 */
export async function updateHolding(
  holdingId: string,
  data: {
    investmentType?: string
    name?: string
    units?: number | null
    currentValue?: number
    currency?: string
    asOfDate?: string
    symbol?: string | null
    isin?: string | null
    averageCost?: number | null
    currentPrice?: number | null
    investedValue?: number | null
    folioNumber?: string | null
    maturityDate?: string | null
    interestRate?: number | null
  }
): Promise<InvestmentHolding> {
  const response = await api.patch(`/investments/holdings/${holdingId}`, data)
  return response.data.holding
}

/**
 * Delete a holding
 */
export async function deleteHolding(holdingId: string): Promise<void> {
  await api.delete(`/investments/holdings/${holdingId}`)
}

/**
 * Get snapshots for a source
 */
export async function getSnapshotsForSource(
  sourceId: string,
  options?: { startDate?: string; endDate?: string; limit?: number }
): Promise<InvestmentSnapshot[]> {
  const params = new URLSearchParams()
  if (options?.startDate) params.set('startDate', options.startDate)
  if (options?.endDate) params.set('endDate', options.endDate)
  if (options?.limit) params.set('limit', options.limit.toString())
  const queryString = params.toString() ? `?${params.toString()}` : ''
  const response = await api.get(`/investments/sources/${sourceId}/snapshots${queryString}`)
  return response.data.snapshots
}

/**
 * Get all snapshots (across all sources)
 */
export async function getAllSnapshots(
  profileId?: string,
  options?: { startDate?: string; endDate?: string; limit?: number }
): Promise<InvestmentSnapshot[]> {
  const params = new URLSearchParams()
  if (profileId) params.set('profileId', profileId)
  if (options?.startDate) params.set('startDate', options.startDate)
  if (options?.endDate) params.set('endDate', options.endDate)
  if (options?.limit) params.set('limit', options.limit.toString())
  const queryString = params.toString() ? `?${params.toString()}` : ''
  const response = await api.get(`/investments/snapshots${queryString}`)
  return response.data.snapshots
}

/**
 * Create a snapshot manually
 */
export async function createSnapshot(data: {
  sourceId?: string | null
  profileId: string
  snapshotDate: string
  snapshotType: 'manual'
  totalCurrent: number
  holdingsCount: number
  currency: string
  totalInvested?: number | null
  holdingsDetail?: SnapshotHoldingDetail[] | null
}): Promise<InvestmentSnapshot> {
  const response = await api.post('/investments/snapshots', data)
  return response.data.snapshot
}

/**
 * Delete a snapshot
 */
export async function deleteSnapshot(snapshotId: string): Promise<void> {
  await api.delete(`/investments/snapshots/${snapshotId}`)
}

// ============================================
// Summary API
// ============================================

/**
 * Account balance info for net worth
 */
export interface AccountBalanceInfo {
  accountId: string
  accountName: string | null
  type: string
  institution: string | null
  currency: string
  latestBalance: number | null
  latestStatementDate: string | null
  statementBalance?: number | null
  paymentsSinceStatement?: number
  isLiability: boolean
}

/**
 * Financial summary response
 * Net worth = total assets (cash + investments) - total liabilities
 */
export interface FinancialSummary {
  netWorth: {
    total: number // True net worth: totalAssets - totalLiabilities
    totalAssets: number // Cash + investments
    totalLiabilities: number
    currency: string
    calculatedAt: string
    breakdown: {
      cash: {
        total: number
        accounts: AccountBalanceInfo[]
      }
      investments: {
        total: number // Current market value
        invested: number // Original investment amount
        gainLoss: number
        gainLossPercent: number
        holdingsCount: number
        sourcesCount: number
        byType: { type: string; count: number; invested: number; current: number }[]
        byCurrency: { currency: string; invested: number; current: number }[]
      }
      liabilities: {
        total: number
        creditCards: {
          total: number
          accounts: AccountBalanceInfo[]
        }
        loans: {
          total: number
          items: LoanLiabilityInfo[]
        }
      }
    }
  }
  transactions: {
    period: {
      startDate: string
      endDate: string
    }
    totalIncome: number
    totalExpenses: number
    investedAmount: number
    /** income - expenses (investments are not expenses) */
    surplus: number
    /** surplus / income as a fraction; null when there is no income */
    savingsRate: number | null
    transferNet: number
    incomeCount: number
    expenseCount: number
    currency: string
    incomeBreakdown: { category: string; total: number; count: number }[]
    /** Totals can be negative (net refund) */
    categoryBreakdown: { category: string; total: number; count: number }[]
    /** Spending in the same number of whole months just before the period; null without full data */
    previousPeriod: {
      startDate: string
      endDate: string
      totalExpenses: number
      categoryBreakdown: { category: string; total: number; count: number }[]
    } | null
  }
}

/**
 * Data health: statement coverage, reconciliation and cash bridge checks
 */
export interface DataHealthGap {
  from: string
  to: string
  days: number
  afterStatementId: string
  beforeStatementId: string
}

export interface DataHealthOverlap {
  from: string
  to: string
  days: number
  statementIds: [string, string]
}

export interface DataHealthBalanceBreak {
  afterDate: string
  previousStatementId: string
  nextStatementId: string
  previousClosing: number
  nextOpening: number
  difference: number
}

export interface DataHealthMissingPeriod {
  statementId: string
  filename: string
  /** Effective (inferred) dates; null when they could not be derived */
  periodStart: string | null
  periodEnd: string | null
}

export interface DataHealthReconciliation {
  statementId: string
  filename: string
  periodStart: string
  periodEnd: string
  periodInferred: boolean
  status: 'ok' | 'mismatch' | 'unverifiable'
  openingBalance: number | null
  closingBalance: number | null
  expectedClosing: number | null
  difference: number | null
  deletedTransactionCount: number
}

export interface DataHealthAccount {
  accountId: string
  accountName: string
  type: string
  statementCount: number
  coveredFrom: string | null
  coveredTo: string | null
  daysSinceLastStatement: number | null
  isStale: boolean
  gaps: DataHealthGap[]
  overlaps: DataHealthOverlap[]
  balanceBreaks: DataHealthBalanceBreak[]
  /** Statements stored without period dates */
  missingPeriod: DataHealthMissingPeriod[]
  /** Only statements that need attention */
  reconciliation: DataHealthReconciliation[]
}

export type DataHealthCardPaymentKind =
  | 'unlinked_debit'
  | 'card_credit_without_bank'
  | 'broken_link'

export type DataHealthCardPaymentSuggestion =
  | {
      kind: 'transaction'
      transactionId: string
      summary: string | null
      date: string
      amount: number
      accountName: string
    }
  | { kind: 'card'; accountId: string; accountName: string; reason: string }

export interface DataHealthCardPayment {
  id: string
  kind: DataHealthCardPaymentKind
  date: string
  amount: number
  type: 'credit' | 'debit'
  summary: string | null
  accountId: string
  accountName: string
  suggestion: DataHealthCardPaymentSuggestion | null
  dismissed: boolean
}

export interface DataHealthBridge {
  status: 'ok' | 'insufficient'
  startDate: string
  endDate: string
  missingAccounts: Array<{ accountId: string; accountName: string }>
  netChange: number | null
  income: number
  expenses: number
  invested: number
  explained: number
  residual: number | null
}

export interface DataHealthReport {
  dataThrough: string | null
  latestData: string | null
  issueCount: number
  accounts: DataHealthAccount[]
  cardPayments: {
    count: number
    total: number
    items: DataHealthCardPayment[]
    dismissed: DataHealthCardPayment[]
  }
  lowConfidence: { count: number; total: number }
  bridge: DataHealthBridge
}

export interface DataHealthParams {
  profileId?: string
  startDate?: string
  endDate?: string
}

export async function getDataHealth(params: DataHealthParams = {}): Promise<DataHealthReport> {
  const response = await api.get('/data-health', { params })
  return response.data
}

/**
 * Get financial summary for a profile or all profiles (family view)
 */
export async function getSummary(
  profileId: string | undefined,
  options?: { startDate?: string; endDate?: string }
): Promise<FinancialSummary> {
  const params = new URLSearchParams()
  if (profileId) params.set('profileId', profileId)
  if (options?.startDate) params.set('startDate', options.startDate)
  if (options?.endDate) params.set('endDate', options.endDate)

  const response = await api.get(`/summary?${params.toString()}`)
  return response.data
}

/**
 * Monthly trend data point
 */
export interface MonthlyTrendData {
  month: string
  monthLabel: string
  income: number
  expenses: number
  invested: number
  net: number
  /** income - expenses */
  surplus: number
  /** surplus / income as a fraction; null when the month has no income */
  savingsRate: number | null
  /** The range ends before the month does (month in progress or clipped) */
  isPartial: boolean
  /** YYYY-MM-DD the partial month runs through; null for complete months */
  throughDate: string | null
  /** Largest expense category of the month; null when there are no expenses */
  topExpenseCategory: { category: string; total: number } | null
}

/**
 * Monthly trends response
 */
export interface MonthlyTrendsResponse {
  trends: MonthlyTrendData[]
  totals: {
    income: number
    expenses: number
    invested: number
    surplus: number
    savingsRate: number | null
  }
  currency: string
}

/**
 * Options for monthly trends query
 */
export interface MonthlyTrendsOptions {
  /** Number of months to fetch (default: 12) - used if startDate/endDate not provided */
  months?: number
  /** Start date in YYYY-MM-DD format - takes precedence over months */
  startDate?: string
  /** End date in YYYY-MM-DD format - takes precedence over months */
  endDate?: string
}

/**
 * Get monthly income/expense trends
 */
export async function getMonthlyTrends(
  profileId: string | undefined,
  options: MonthlyTrendsOptions = {}
): Promise<MonthlyTrendsResponse> {
  const { months = 12, startDate, endDate } = options

  const params = new URLSearchParams()
  if (profileId) params.set('profileId', profileId)

  if (startDate) {
    params.set('startDate', startDate)
    if (endDate) {
      params.set('endDate', endDate)
    }
  } else {
    params.set('months', months.toString())
  }

  const response = await api.get(`/summary/monthly-trends?${params.toString()}`)
  return response.data
}

/**
 * Month transactions response (with netting applied)
 */
export interface MonthTransactionsResponse {
  month: string
  monthLabel: string
  income: Transaction[]
  expenses: Transaction[]
  investments: Transaction[]
  transfers: Transaction[]
  totals: {
    income: number
    expenses: number
    invested: number
    transferNet: number
    net: number
  }
  incomeBreakdown: { category: string; total: number; count: number }[]
  categoryBreakdown: { category: string; total: number; count: number }[]
  currency: string
}

/**
 * Get transactions for a specific month, grouped by kind
 */
export async function getMonthTransactions(
  profileId: string | undefined,
  month: string,
  range?: { startDate?: string; endDate?: string }
): Promise<MonthTransactionsResponse> {
  const params = new URLSearchParams()
  if (profileId) params.set('profileId', profileId)
  params.set('month', month)
  if (range?.startDate) params.set('startDate', range.startDate)
  if (range?.endDate) params.set('endDate', range.endDate)

  const response = await api.get(`/summary/month-transactions?${params.toString()}`)
  return response.data
}

// ============================================
// Spending Changes API
// ============================================

export interface SpendingChangeTopMerchant {
  merchant: string
  count: number
  amount: number
  delta: number
}

export interface SpendingCategoryChange {
  category: string
  label: string
  current: number
  baselineAverage: number
  delta: number
  deltaPct: number | null
  direction: 'up' | 'down'
  topMerchants: SpendingChangeTopMerchant[]
}

export interface SpendingMerchantChange {
  merchant: string
  category: string
  current: number
  baselineAverage: number
  delta: number
  deltaPct: number | null
  direction: 'up' | 'down'
}

export interface SpendingLargeTransaction {
  id: string
  date: string
  amount: number
  summary: string
  category: string
  reason: 'above_p95' | 'new_merchant'
}

export type SpendingChangesResponse =
  | {
      status: 'insufficient_history'
      currency: string
      month: string
      isPartial: boolean
      baselineMonthsAvailable: number
      baselineMonthsRequired: number
    }
  | {
      status: 'ok'
      currency: string
      month: string
      isPartial: boolean
      note: string | null
      baselineMonths: string[]
      totals: { current: number; baselineAverage: number; delta: number; deltaPct: number | null }
      categories: SpendingCategoryChange[]
      merchants: SpendingMerchantChange[]
      largeTransactions: SpendingLargeTransaction[]
    }

export interface SpendingChangesParams {
  profileId?: string
  /** YYYY-MM; omit for the latest complete month */
  month?: string
  baselineMonths?: number
}

/**
 * Get spending changes for a month vs the average of the previous months
 */
export async function getSpendingChanges(
  options: SpendingChangesParams = {}
): Promise<SpendingChangesResponse> {
  const params = new URLSearchParams()
  if (options.profileId) params.set('profileId', options.profileId)
  if (options.month) params.set('month', options.month)
  if (options.baselineMonths) params.set('baselineMonths', options.baselineMonths.toString())

  const response = await api.get(`/summary/changes?${params.toString()}`)
  return response.data
}

// ============================================
// Preferences API
// ============================================

/**
 * Preference keys
 */
export const PREFERENCE_KEYS = {
  DASHBOARD_CHART_TIMEFRAME: 'dashboard.chart_timeframe',
  // Dashboard widgets switched off in Settings (JSON array of widget ids)
  DASHBOARD_HIDDEN_WIDGETS: 'dashboard.hidden_widgets',
  // Data health checks the user chose to ignore (JSON array of issue keys)
  DATA_HEALTH_IGNORED_CHECKS: 'data_health.ignored_checks',
  // Profile selection
  SELECTED_PROFILE: 'selected_profile',
  // Chat preferences
  CHAT_PROVIDER: 'chat.provider',
  CHAT_MODEL: 'chat.model',
  CHAT_THINKING_LEVEL: 'chat.thinking_level',
  // Statement processing preferences
  STATEMENT_PARSING_PROVIDER: 'statement.parsing.provider',
  STATEMENT_PARSING_MODEL: 'statement.parsing.model',
  STATEMENT_CATEGORISATION_PROVIDER: 'statement.categorisation.provider',
  STATEMENT_CATEGORISATION_MODEL: 'statement.categorisation.model',
  DEFAULT_CATEGORIZATION_HINTS: 'statement.default_categorization_hints',
} as const

/**
 * Get all preferences
 */
export async function getPreferences(profileId?: string): Promise<Record<string, string>> {
  const params = profileId ? `?profileId=${profileId}` : ''
  const response = await api.get(`/preferences${params}`)
  return response.data.preferences
}

/**
 * Get a specific preference
 */
export async function getPreference(
  key: string,
  profileId?: string
): Promise<{ key: string; value: string | null; profileId: string | null }> {
  const params = profileId ? `?profileId=${profileId}` : ''
  const response = await api.get(`/preferences/${encodeURIComponent(key)}${params}`)
  return response.data
}

/**
 * Set a preference
 */
export async function setPreference(
  key: string,
  value: string,
  profileId?: string | null
): Promise<void> {
  await api.put('/preferences', { key, value, profileId })
}

/**
 * Delete a preference
 */
export async function deletePreference(key: string, profileId?: string): Promise<void> {
  const params = profileId ? `?profileId=${profileId}` : ''
  await api.delete(`/preferences/${encodeURIComponent(key)}${params}`)
}

// ============================================
// FX Rates API
// ============================================

/**
 * FX rates response
 */
export interface FxRatesResponse {
  success: boolean
  data?: {
    date: string
    baseCurrency: string
    rates: Record<string, number>
    fetchedAt: string
  }
  error?: string
}

/**
 * FX rate conversion response
 */
export interface FxRateResponse {
  success: boolean
  data?: {
    from: string
    to: string
    rate: number
  }
  error?: string
}

/**
 * Get FX rates for a base currency
 */
export async function getFxRates(baseCurrency: string = 'USD'): Promise<FxRatesResponse> {
  const response = await api.get(`/summary/fx-rates?base=${baseCurrency.toLowerCase()}`)
  return response.data
}

/**
 * Get conversion rate between two currencies
 */
export async function getFxRate(from: string, to: string): Promise<FxRateResponse> {
  const response = await api.get(`/summary/fx-rate?from=${from}&to=${to}`)
  return response.data
}

// ============================================
// Subscriptions API
// ============================================

/**
 * Detected subscription
 */
export interface DetectedSubscription {
  /** Merchant key; identifies the subscription when editing or removing it */
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
  /** True when the frequency was set by the user instead of detected */
  isFrequencySet: boolean
}

export type SubscriptionFrequency = 'monthly' | 'quarterly' | 'yearly'

/**
 * Subscriptions response
 */
export interface SubscriptionsResponse {
  subscriptions: DetectedSubscription[]
  totalMonthly: number
  currency: string
}

/**
 * Get detected subscriptions
 */
export async function getSubscriptions(
  profileId: string | undefined
): Promise<SubscriptionsResponse> {
  const params = new URLSearchParams()
  if (profileId) params.set('profileId', profileId)

  const response = await api.get(`/summary/subscriptions?${params.toString()}`)
  return response.data
}

/**
 * Add a recurring payment as a subscription by picking one of its transactions
 */
export async function addSubscription(
  transactionId: string,
  frequency: SubscriptionFrequency
): Promise<void> {
  await api.post('/summary/subscriptions', { transactionId, frequency })
}

/**
 * Set how often a subscription is billed
 */
export async function setSubscriptionFrequency(
  key: string,
  frequency: SubscriptionFrequency
): Promise<void> {
  await api.put('/summary/subscriptions/frequency', { key, frequency })
}

/**
 * Remove a subscription so it is no longer detected
 */
export async function removeSubscription(key: string): Promise<void> {
  await api.post('/summary/subscriptions/remove', { key })
}

// ============================================
// Constants API
// ============================================

/**
 * Institution type (bank, NBFC, etc.)
 */
export interface Institution {
  id: string
  name: string
  logo: string
  website?: string
}

/**
 * Investment source type (broker, platform, etc.)
 */
export interface InvestmentSourceType {
  code: string
  label: string
  logo: string
}

/**
 * Investment holding type
 */
export interface InvestmentHoldingType {
  code: string
  label: string
}

/**
 * All constants response
 */
export interface ConstantsResponse {
  countryCode: string
  institutions: Institution[]
  insuranceProviders: Institution[]
  investmentSourceTypes: InvestmentSourceType[]
  accountTypes: AccountType[]
  categories: Category[]
  investmentTypes: { code: string; label: string }[]
  investmentHoldingTypes: InvestmentHoldingType[]
  countries: Country[]
}

/**
 * Get all constants for the user's country
 */
export async function getConstants(): Promise<ConstantsResponse> {
  const response = await api.get('/constants')
  return response.data
}

/**
 * Get institutions for the user's country
 */
export async function getInstitutions(): Promise<{
  institutions: Institution[]
  countryCode: string
}> {
  const response = await api.get('/constants/institutions')
  return response.data
}

/**
 * Get investment source types for the user's country
 */
export async function getInvestmentSourceTypes(): Promise<{
  sourceTypes: InvestmentSourceType[]
  countryCode: string
}> {
  const response = await api.get('/constants/investment-sources')
  return response.data
}

// ============================================
// Insurance API
// ============================================

/**
 * Insurance policy type
 */
export type InsurancePolicyType = 'life_insurance' | 'health_insurance' | 'vehicle_insurance'

/**
 * Premium frequency
 */
export type PremiumFrequency = 'monthly' | 'quarterly' | 'half_yearly' | 'yearly'

/**
 * Insurance policy status
 */
export type InsurancePolicyStatus = 'active' | 'expired' | 'cancelled'

/**
 * Insurance parse status
 */
export type InsuranceParseStatus = 'pending' | 'parsing' | 'completed' | 'failed'

/**
 * Insurance policy interface
 */
export interface InsurancePolicy {
  id: string
  profileId: string
  userId: string
  policyType: InsurancePolicyType
  provider: string
  institution: string | null
  policyNumber: string | null
  policyHolderName: string | null
  sumInsured: number | null
  premiumAmount: number | null
  premiumFrequency: PremiumFrequency | null
  startDate: string | null
  endDate: string | null
  status: InsurancePolicyStatus
  details: Record<string, unknown> | null
  originalFilename: string | null
  fileType: string | null
  parseStatus: InsuranceParseStatus
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  // Optional for family view
  profileName?: string
}

/**
 * Insurance upload response
 */
export interface InsuranceUploadResponse {
  policyId: string
  status: 'pending'
  filename: string
}

/**
 * Get all insurance policies for user (family view)
 */
export async function getInsurancePolicies(filters?: {
  policyType?: InsurancePolicyType
  status?: InsurancePolicyStatus
  parseStatus?: InsuranceParseStatus
}): Promise<InsurancePolicy[]> {
  const params = new URLSearchParams()
  if (filters?.policyType) params.set('policyType', filters.policyType)
  if (filters?.status) params.set('status', filters.status)
  if (filters?.parseStatus) params.set('parseStatus', filters.parseStatus)
  const queryString = params.toString() ? `?${params.toString()}` : ''
  const response = await api.get(`/insurance/policies${queryString}`)
  return response.data.policies
}

/**
 * Get insurance policies for a specific profile
 */
export async function getInsurancePoliciesByProfile(
  profileId: string,
  filters?: {
    policyType?: InsurancePolicyType
    status?: InsurancePolicyStatus
    parseStatus?: InsuranceParseStatus
  }
): Promise<InsurancePolicy[]> {
  const params = new URLSearchParams()
  if (filters?.policyType) params.set('policyType', filters.policyType)
  if (filters?.status) params.set('status', filters.status)
  if (filters?.parseStatus) params.set('parseStatus', filters.parseStatus)
  const queryString = params.toString() ? `?${params.toString()}` : ''
  const response = await api.get(`/insurance/profiles/${profileId}/policies${queryString}`)
  return response.data.policies
}

/**
 * Get a single insurance policy
 */
export async function getInsurancePolicy(policyId: string): Promise<InsurancePolicy> {
  const response = await api.get(`/insurance/policies/${policyId}`)
  return response.data.policy
}

/**
 * Upload an insurance policy PDF
 */
export async function uploadInsurancePolicy(
  file: File,
  profileId: string,
  options?: {
    policyType?: InsurancePolicyType
    parsingModel?: string
    password?: string
  }
): Promise<InsuranceUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('profileId', profileId)
  if (options?.policyType) formData.append('policyType', options.policyType)
  if (options?.parsingModel) formData.append('parsingModel', options.parsingModel)
  if (options?.password) formData.append('password', options.password)

  const response = await api.post('/insurance/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

/**
 * Update an insurance policy
 */
export async function updateInsurancePolicy(
  policyId: string,
  data: Partial<{
    policyType: InsurancePolicyType
    provider: string
    policyNumber: string | null
    policyHolderName: string | null
    sumInsured: number | null
    premiumAmount: number | null
    premiumFrequency: PremiumFrequency | null
    startDate: string | null
    endDate: string | null
    status: InsurancePolicyStatus
    details: Record<string, unknown> | null
  }>
): Promise<InsurancePolicy> {
  const response = await api.put(`/insurance/policies/${policyId}`, data)
  return response.data.policy
}

/**
 * Delete an insurance policy
 */
export async function deleteInsurancePolicy(policyId: string): Promise<void> {
  await api.delete(`/insurance/policies/${policyId}`)
}

// ============================================
// Loans API
// ============================================

/**
 * Loan type
 */
export type LoanType =
  | 'personal_loan'
  | 'home_loan'
  | 'vehicle_loan'
  | 'education_loan'
  | 'business_loan'
  | 'gold_loan'

/**
 * Interest type
 */
export type InterestType = 'fixed' | 'floating'

/**
 * Loan status
 */
export type LoanStatus = 'active' | 'closed'

/**
 * Loan parse status
 */
export type LoanParseStatus = 'pending' | 'parsing' | 'completed' | 'failed'

/**
 * Loan interface
 */
export interface Loan {
  id: string
  profileId: string
  userId: string
  loanType: LoanType
  lender: string
  institution: string | null
  loanAccountNumber: string | null
  borrowerName: string | null
  principalAmount: number | null
  interestRate: number | null
  interestType: InterestType | null
  emiAmount: number | null
  tenureMonths: number | null
  disbursementDate: string | null
  firstEmiDate: string | null
  endDate: string | null
  status: LoanStatus
  details: Record<string, unknown> | null
  originalFilename: string | null
  fileType: string | null
  parseStatus: LoanParseStatus
  errorMessage: string | null
  createdAt: string
  updatedAt: string
  // Optional for family view
  profileName?: string
}

/**
 * Loan upload response
 */
export interface LoanUploadResponse {
  loanId: string
  status: 'pending'
  filename: string
}

/**
 * Get all loans for user (family view)
 */
export async function getLoans(filters?: {
  loanType?: LoanType
  status?: LoanStatus
  parseStatus?: LoanParseStatus
}): Promise<Loan[]> {
  const params = new URLSearchParams()
  if (filters?.loanType) params.set('loanType', filters.loanType)
  if (filters?.status) params.set('status', filters.status)
  if (filters?.parseStatus) params.set('parseStatus', filters.parseStatus)
  const queryString = params.toString() ? `?${params.toString()}` : ''
  const response = await api.get(`/loans${queryString}`)
  return response.data.loans
}

/**
 * Get loans for a specific profile
 */
export async function getLoansByProfile(
  profileId: string,
  filters?: {
    loanType?: LoanType
    status?: LoanStatus
    parseStatus?: LoanParseStatus
  }
): Promise<Loan[]> {
  const params = new URLSearchParams()
  if (filters?.loanType) params.set('loanType', filters.loanType)
  if (filters?.status) params.set('status', filters.status)
  if (filters?.parseStatus) params.set('parseStatus', filters.parseStatus)
  const queryString = params.toString() ? `?${params.toString()}` : ''
  const response = await api.get(`/loans/profiles/${profileId}${queryString}`)
  return response.data.loans
}

/**
 * Get a single loan
 */
export async function getLoan(loanId: string): Promise<Loan> {
  const response = await api.get(`/loans/${loanId}`)
  return response.data.loan
}

/**
 * Upload a loan document PDF
 */
export async function uploadLoan(
  file: File,
  profileId: string,
  options?: {
    loanType?: LoanType
    parsingModel?: string
    password?: string
  }
): Promise<LoanUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('profileId', profileId)
  if (options?.loanType) formData.append('loanType', options.loanType)
  if (options?.parsingModel) formData.append('parsingModel', options.parsingModel)
  if (options?.password) formData.append('password', options.password)

  const response = await api.post('/loans/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

/**
 * Update a loan
 */
export async function updateLoan(
  loanId: string,
  data: Partial<{
    loanType: LoanType
    lender: string
    loanAccountNumber: string | null
    borrowerName: string | null
    principalAmount: number | null
    interestRate: number | null
    interestType: InterestType | null
    emiAmount: number | null
    tenureMonths: number | null
    disbursementDate: string | null
    firstEmiDate: string | null
    endDate: string | null
    status: LoanStatus
    details: Record<string, unknown> | null
  }>
): Promise<Loan> {
  const response = await api.put(`/loans/${loanId}`, data)
  return response.data.loan
}

/**
 * Delete a loan
 */
export async function deleteLoan(loanId: string): Promise<void> {
  await api.delete(`/loans/${loanId}`)
}

/**
 * Payment history entry
 */
export interface PaymentHistoryEntry {
  id: string
  date: string
  amount: number
  summary: string | null
  accountId: string
}

/**
 * Get loan payment history
 */
export async function getLoanPaymentHistory(loanId: string): Promise<PaymentHistoryEntry[]> {
  const response = await api.get(`/loans/${loanId}/payment-history`)
  return response.data.payments
}

/**
 * Loan outstanding calculation with principal progress
 * Uses payment-by-payment simulation for accurate calculation
 */
export interface LoanOutstanding {
  principalAmount: number
  totalPaid: number
  paymentCount: number
  emisCompleted: number
  totalEmis: number
  // Principal progress (using payment simulation)
  outstandingPrincipal: number
  principalPaid: number
  interestPaid: number
  principalProgressPercent: number
  // Total payable progress (original schedule)
  totalPayable: number | null
  totalInterest: number | null
  remainingPayable: number | null
  // Interest savings from prepayments
  interestSaved: number | null
}

/**
 * Loan liability info for net worth calculation
 */
export interface LoanLiabilityInfo {
  loanId: string
  loanType: string
  lender: string
  institution: string | null
  principalAmount: number
  outstandingBalance: number
  totalPaid: number
  paymentsMade: number
  interestRate: number | null
  tenureMonths: number | null
  status: string
}

/**
 * Get loan outstanding calculation
 */
export async function getLoanOutstanding(loanId: string): Promise<LoanOutstanding> {
  const response = await api.get(`/loans/${loanId}/outstanding`)
  return response.data
}

/**
 * Get insurance payment history
 */
export async function getInsurancePaymentHistory(policyId: string): Promise<PaymentHistoryEntry[]> {
  const response = await api.get(`/insurance/policies/${policyId}/payment-history`)
  return response.data.payments
}

/**
 * CC payment history entry (includes source account)
 */
export interface CCPaymentHistoryEntry {
  id: string
  date: string
  amount: number
  summary: string | null
  sourceAccountId: string
}

/**
 * Get credit card payment history
 */
export async function getCreditCardPaymentHistory(
  accountId: string
): Promise<CCPaymentHistoryEntry[]> {
  const response = await api.get(`/accounts/${accountId}/payment-history`)
  return response.data.payments
}

// ============================================
// Chat API
// ============================================

/**
 * Chat message role
 */
export type ChatMessageRole = 'user' | 'assistant' | 'tool'

/**
 * Step types for streaming response
 */
export type ReasoningStep = { type: 'reasoning'; content: string }
export type ToolCallStep = {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  args: unknown
}
export type TextStep = { type: 'text'; content: string }
export type ChatStep = ReasoningStep | ToolCallStep | TextStep

/**
 * Chat message type
 */
export interface ChatMessage {
  id: string
  conversationId: string
  role: ChatMessageRole
  content: string | null
  provider: string | null
  model: string | null
  toolCalls: Array<{ toolCallId: string; toolName: string; args: unknown }> | null
  toolResults: Array<{ toolCallId: string; toolName: string; result: unknown }> | null
  reasoning: ChatStep[] | null
  approvalState: Array<{
    type: 'pending'
    toolCallId: string
    toolName: string
    confirmationData?: unknown
  }> | null
  createdAt: string
}

/**
 * Chat conversation type
 */
export interface ChatConversation {
  id: string
  profileId: string
  userId: string
  title: string | null
  summary: string | null
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
}

/**
 * AI model type
 */
export interface AIModel {
  id: string
  name: string
  supportsParsing?: boolean
  recommendedForParsing?: boolean
  recommendedForCategorization?: boolean
  recommendedForChat?: boolean
  supportsThinking?: boolean
  reasoningBuiltIn?: boolean
}

/**
 * List all conversations for a profile (or family view if profileId is undefined)
 */
export async function listConversations(
  profileId: string | undefined
): Promise<Omit<ChatConversation, 'messages'>[]> {
  const endpoint = profileId ? `/chat/profiles/${profileId}/conversations` : '/chat/conversations'
  const response = await api.get(endpoint)
  return response.data
}

/**
 * Create a new conversation for a profile (or family view if profileId is undefined)
 */
export async function createConversation(
  profileId: string | undefined
): Promise<Omit<ChatConversation, 'messages'>> {
  const endpoint = profileId ? `/chat/profiles/${profileId}/conversations` : '/chat/conversations'
  const response = await api.post(endpoint)
  return response.data
}

/**
 * Get a specific conversation with messages
 */
export async function getConversationById(conversationId: string): Promise<ChatConversation> {
  const response = await api.get(`/chat/conversations/${conversationId}`)
  return response.data
}

/**
 * Get or create conversation for a profile (legacy - returns most recent)
 */
export async function getConversation(profileId: string): Promise<ChatConversation> {
  const response = await api.get(`/chat/profiles/${profileId}/conversation`)
  return response.data
}

/**
 * Delete a conversation
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  await api.delete(`/chat/conversations/${conversationId}`)
}

/**
 * Clear conversation messages (but keep the conversation)
 */
export async function clearConversation(conversationId: string): Promise<void> {
  await api.delete(`/chat/conversations/${conversationId}/messages`)
}

/**
 * Query data response for data-table components
 */
export interface QueryDataResponse {
  queryId: string
  dataType: 'transactions' | 'holdings' | 'accounts' | 'subscriptions' | 'monthly_trends' | 'stats'
  count: number
  schema: {
    fields: Array<{
      name: string
      type: 'string' | 'number' | 'boolean' | 'date' | 'object'
      description?: string
    }>
  }
  data: unknown[]
}

/**
 * Get query data for rendering in data-table components
 */
export async function getQueryData(queryId: string): Promise<QueryDataResponse> {
  const response = await api.get(`/chat/query/${queryId}`)
  return response.data
}

/**
 * SSE Event types
 */
export type ChatSSEEvent =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }
  | { type: 'done' }
  | { type: 'error'; error: string }

/**
 * Send a message and stream the response
 */
export async function sendChatMessage(
  conversationId: string,
  content: string,
  options: {
    provider: string
    model: string
    thinkingEnabled?: boolean
    thinkingBudget?: number
    reasoningEffort?: 'low' | 'medium' | 'high'
    thinkingLevel?: 'low' | 'medium' | 'high'
    onEvent: (event: ChatSSEEvent) => void
    signal?: AbortSignal
  }
): Promise<void> {
  const response = await fetch(
    `${api.defaults.baseURL}/chat/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        content,
        provider: options.provider,
        model: options.model,
        thinkingEnabled: options.thinkingEnabled,
        thinkingBudget: options.thinkingBudget,
        reasoningEffort: options.reasoningEffort,
        thinkingLevel: options.thinkingLevel,
      }),
      signal: options.signal,
    }
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to send message' }))
    throw new Error(error.error || 'Failed to send message')
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('No response body')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // Process SSE events
    const lines = buffer.split('\n')
    buffer = lines.pop() || '' // Keep incomplete line in buffer

    let currentEvent = ''
    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim()
        continue
      }
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim()
        if (!data) continue

        try {
          const parsed = JSON.parse(data)

          // Handle events based on the event type from SSE
          switch (currentEvent) {
            case 'text':
              options.onEvent({ type: 'text', text: parsed.text })
              break
            case 'reasoning':
              options.onEvent({ type: 'reasoning', text: parsed.text })
              break
            case 'tool-call':
              options.onEvent({
                type: 'tool-call',
                toolCallId: parsed.toolCallId,
                toolName: parsed.toolName,
                args: parsed.args,
              })
              break
            case 'tool-result':
              options.onEvent({
                type: 'tool-result',
                toolCallId: parsed.toolCallId,
                toolName: parsed.toolName,
                result: parsed.result,
              })
              break
            case 'done':
              options.onEvent({ type: 'done' })
              break
            case 'error':
              options.onEvent({ type: 'error', error: parsed.error })
              break
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  }
}

// ============================================
// Reports API
// ============================================

/** Months a report can cover (YYYY-MM) */
export interface ReportBounds {
  /** Null without data */
  earliestMonth: string | null
  lastCompleteMonth: string
  /** The month in progress; it shows the data so far */
  currentMonth: string
}

export interface ReportComparison {
  from: string
  to: string
  startDate: string
  endDate: string
  months: string[]
}

export interface ReportPeriod extends ReportComparison {
  /** Null when the comparison would start before the data does */
  comparison: ReportComparison | null
}

export interface ReportChange {
  delta: number
  /** Fraction; null when the previous value was 0 */
  deltaPct: number | null
}

/** A row of a current-vs-previous table; previous values are null without a comparison */
export interface ReportComparedRow {
  key: string
  label: string
  current: number
  previous: number | null
  delta: number | null
  deltaPct: number | null
  count: number
  previousCount: number | null
}

export interface ReportPeriodTotals {
  income: number
  expenses: number
  invested: number
  surplus: number
  savingsRate: number | null
}

export interface ReportAccountFlow {
  income: number
  expenses: number
  invested: number
}

export interface ReportAccountFlowRow {
  id: string
  name: string
  type: 'bank' | 'card' | 'other'
  last4: string | null
  current: ReportAccountFlow
  previous: ReportAccountFlow | null
}

export interface ReportSavingsBreakdown {
  status: 'ok' | 'insufficient'
  surplus: number
  invested: number
  bankChange: number | null
  cardDuesReduced: number | null
  unexplained: number | null
  missingAccounts: Array<{ accountId: string; accountName: string }>
}

export interface ReportWarning {
  kind:
    | 'missing_statements'
    | 'overlap'
    | 'coverage'
    | 'balance_break'
    | 'mismatch'
    | 'unlinked_payment'
  accountName: string
  message: string
  amount: number | null
}

export interface PeriodReport {
  period: ReportPeriod
  totals: {
    current: ReportPeriodTotals
    previous: ReportPeriodTotals | null
    changes: Record<'income' | 'expenses' | 'invested' | 'surplus', ReportChange> | null
    /** Fraction points (0.05 = 5 points) */
    savingsRateDelta: number | null
  }
  expenseCategories: ReportComparedRow[]
  incomeCategories: ReportComparedRow[]
  investmentCategories: ReportComparedRow[]
  merchants: ReportComparedRow[]
  accounts: ReportAccountFlowRow[]
  savings: ReportSavingsBreakdown
  warnings: { count: number; items: ReportWarning[] }
  currency: string
}

export interface ReportMonthlyRow {
  key: string
  label: string
  /** One amount per month of the report */
  months: number[]
  total: number
  average: number
}

export interface ReportMerchantTrendRow extends ReportMonthlyRow {
  payments: number
  averagePerPayment: number | null
  trend: 'rising' | 'falling' | 'steady' | null
}

export interface ReportAccountMonthlyRow extends ReportMonthlyRow {
  type: 'bank' | 'card' | 'other'
  last4: string | null
}

export interface TrendsReport {
  from: string
  to: string
  months: string[]
  categories: ReportMonthlyRow[]
  merchants: ReportMerchantTrendRow[]
  accounts: ReportAccountMonthlyRow[]
  monthTotals: number[]
  total: number
  average: number
  currency: string
}

export interface InvestmentFlow {
  putIn: number
  takenOut: number
  net: number
  count: number
}

export interface InvestmentPlatformRow {
  sourceId: string
  name: string
  provider: string
  institution: string | null
  putIn: number
  takenOut: number
  previousPutIn: number | null
  netSinceStart: number
  currentValue: number | null
  cost: number | null
  gain: number | null
  gainPct: number | null
  asOfDate: string | null
  holdingsCount: number
}

export interface InvestmentsReport {
  period: ReportPeriod
  totals: {
    current: InvestmentFlow
    previous: InvestmentFlow | null
    putInChange: ReportChange | null
  }
  byMonth: Array<{ month: string; putIn: number; takenOut: number; net: number }>
  platforms: InvestmentPlatformRow[]
  unmatched: { putIn: number; takenOut: number; count: number }
  allocation: Array<{ type: string; label: string; value: number; share: number }>
  overall: {
    currentValue: number
    cost: number
    gain: number
    gainPct: number | null
    holdingsCount: number
  }
  currency: string
}

/** First and last month (YYYY-MM) of a report */
export interface ReportRangeParams {
  profileId?: string
  from: string
  to: string
}

/** The months a report can cover */
export async function getReportBounds(profileId?: string): Promise<ReportBounds> {
  const response = await api.get('/reports/months', { params: { profileId } })
  return response.data
}

/** Period report: complete months against the months just before */
export async function getPeriodReport(params: ReportRangeParams): Promise<PeriodReport> {
  const response = await api.get('/reports/period', { params })
  return response.data
}

/** Spending trends: category, merchant and account spend month by month */
export async function getTrendsReport(params: ReportRangeParams): Promise<TrendsReport> {
  const response = await api.get('/reports/trends', { params })
  return response.data
}

/** Investments: money put in, per platform, with current values */
export async function getInvestmentsReport(params: ReportRangeParams): Promise<InvestmentsReport> {
  const response = await api.get('/reports/investments', { params })
  return response.data
}

// ============================================
// Backups
// ============================================

export type BackupKind = 'auto' | 'manual' | 'before-restore'

export interface BackupInfo {
  name: string
  size: number
  createdAt: string
  kind: BackupKind
}

export interface BackupsResponse {
  /** False when the database does not support file backups (PostgreSQL) */
  supported: boolean
  backups: BackupInfo[]
}

/** All saved backups, newest first */
export async function getBackups(): Promise<BackupsResponse> {
  const response = await api.get('/backups')
  return response.data
}

/** Save a backup of the current data now */
export async function createBackup(): Promise<BackupInfo> {
  const response = await api.post('/backups')
  return response.data.backup
}

/** Choose a backup to restore the next time the app starts */
export async function restoreBackup(name: string): Promise<void> {
  await api.post(`/backups/${encodeURIComponent(name)}/restore`)
}

/** Link that downloads a backup as a zip (opened by the browser, which sends the login cookie) */
export function getBackupDownloadUrl(name: string): string {
  return `/api/backups/${encodeURIComponent(name)}/download`
}

/** Save a backup zip to the Downloads folder (desktop app); returns where it was saved */
export async function exportBackup(name: string): Promise<string> {
  const response = await api.post(`/backups/${encodeURIComponent(name)}/export`)
  return response.data.path
}

// ============================================
// SMS Import API (bank alerts from the Messages app)
// ============================================

export type MessagesAccess = 'ok' | 'permission_denied' | 'not_found'

export interface SmsImportStatus {
  /** Reading Messages only works in the macOS desktop / local app */
  supported: boolean
  enabled: boolean
  aiParsing: boolean
  /** Whether an AI provider is set up, needed for AI parsing */
  aiAvailable: boolean
  access: MessagesAccess | null
  lastSyncAt: string | null
  pendingCount: number
}

export interface PendingSms {
  /** The date stated in the message, when it has one */
  date: string | null
  id: string
  sender: string
  receivedAt: string
  body: string
  amount: number | null
  currency: string | null
  type: 'credit' | 'debit' | null
  merchant: string | null
  last4: string | null
  accountId: string | null
}

export interface SmsImportInput {
  accountId: string
  date: string
  amount: number
  currency: string
  type: 'credit' | 'debit'
  merchant: string
}

export async function getSmsImportStatus(): Promise<SmsImportStatus> {
  const response = await api.get('/sms-import/status')
  return response.data
}

export async function updateSmsImportSettings(patch: {
  enabled?: boolean
  aiParsing?: boolean
}): Promise<SmsImportStatus> {
  const response = await api.put('/sms-import/settings', patch)
  return response.data
}

/** Read messages now: new ones after the last read message, or all since a date (YYYY-MM-DD) */
export async function syncSmsImport(
  since?: string
): Promise<{ imported: number; needsReview: number; verified: number }> {
  const response = await api.post('/sms-import/sync', since ? { since } : {})
  return response.data
}

/** Remove all synced messages and the transactions created from them */
export async function clearSmsImport(): Promise<{ transactions: number; messages: number }> {
  const response = await api.delete('/sms-import/messages')
  return response.data
}

export async function getPendingSms(): Promise<PendingSms[]> {
  const response = await api.get('/sms-import/pending')
  return response.data.messages
}

export async function importPendingSms(id: string, data: SmsImportInput): Promise<void> {
  await api.post(`/sms-import/pending/${encodeURIComponent(id)}/import`, data)
}

export async function dismissPendingSms(id: string): Promise<void> {
  await api.post(`/sms-import/pending/${encodeURIComponent(id)}/dismiss`)
}

export interface SyncedSms {
  id: string
  sender: string
  receivedAt: string
  status: 'imported' | 'needs_review' | 'dismissed' | 'verified'
  amount: number | null
  currency: string | null
  type: 'credit' | 'debit' | null
  merchant: string | null
  last4: string | null
  accountId: string | null
  transactionId: string | null
  /** The transaction the message created or verified */
  transaction: Transaction | null
  /** When the message became a transaction */
  importedAt: string
}

export async function getSyncedSms(): Promise<SyncedSms[]> {
  const response = await api.get('/sms-import/messages')
  return response.data.messages
}

/** Open System Settings at Full Disk Access (the app's web view cannot open that link itself) */
export async function openSmsPermissionSettings(): Promise<void> {
  await api.post('/sms-import/open-settings')
}
