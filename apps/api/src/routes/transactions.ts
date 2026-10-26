import { Hono, type Context } from 'hono'
import { z } from 'zod/v4'
import { auth, type AuthVariables } from '../middleware/auth'
import {
  getTransactions,
  getTransactionById,
  updateTransaction,
  createManualTransaction,
  bulkUpdateTransactions,
  bulkDeleteTransactions,
  getTransactionIds,
  MAX_BULK_TRANSACTIONS,
  findDuplicateGroups,
  getReviewCounts,
  type TransactionFilters,
  linkTransactions,
  unlinkTransaction,
  findLinkCandidates,
  getTransactionStats,
} from '../services/transactions'
import {
  queueRecategorizeJob,
  getRecategorizeJobStatus,
  getCategorizationStatus,
} from '../services/statements'
import { queueRenameJob, getRenameJobStatus } from '../services/transaction-rename'
import { getProfileById } from '../services/profiles'
import {
  findPossibleMatches,
  confirmPossibleMatch,
  rejectPossibleMatch,
} from '../services/sms-matching'
import { setCardPaymentsDismissed, setDuplicatesDismissed } from '../services/preferences'
import { getLinkSuggestions } from '../services/card-payments'
import { getAccountByIdRaw } from '../services/accounts'
import { findUserById } from '../services/user'
import { TRANSACTION_LINK_TYPES, isKnownCategory, type CountryCode } from '../lib/constants'
import {
  transactionAmountSchema,
  transactionCategorySchema,
  transactionDateSchema,
  transactionTypeSchema,
} from '../lib/transaction-input'

const transactionRoutes = new Hono<{ Variables: AuthVariables }>()

// Apply auth to all routes
transactionRoutes.use('*', auth())

/**
 * Update transaction request schema
 */
const updateTransactionSchema = z.object({
  category: transactionCategorySchema.optional(),
  summary: z.string().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isHidden: z.boolean().optional(),
  date: transactionDateSchema.optional(),
  amount: transactionAmountSchema.optional(),
  type: transactionTypeSchema.optional(),
  // Entity linking - allows manual linking/unlinking
  linkedEntityId: z.string().nullable().optional(),
  linkedEntityType: z.enum(['credit_card', 'insurance', 'loan']).nullable().optional(),
})

/**
 * Create (manual) transaction request schema
 */
const createTransactionSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  date: transactionDateSchema,
  amount: transactionAmountSchema,
  type: transactionTypeSchema,
  summary: z.string().trim().min(1, 'Name is required').max(200),
  category: transactionCategorySchema,
  isHidden: z.boolean().optional(),
})

/**
 * Bulk update request schema (no entity linking - that is specific to one transaction)
 */
const bulkUpdateSchema = z
  .object({
    transactionIds: z
      .array(z.string().min(1))
      .min(1, 'Select at least one transaction')
      .max(MAX_BULK_TRANSACTIONS),
    category: z
      .string()
      .min(1)
      .refine((c) => isKnownCategory(c), { message: 'Unknown category' })
      .optional(),
    summary: z.string().optional(),
    isHidden: z.boolean().optional(),
    confirmCategory: z.literal(true).optional(),
  })
  .refine(
    (data) =>
      data.category !== undefined ||
      data.summary !== undefined ||
      data.isHidden !== undefined ||
      data.confirmCategory !== undefined,
    { message: 'Nothing to update' }
  )

/**
 * Bulk delete request schema
 */
const dismissDuplicatesSchema = z.object({
  signatures: z.array(z.string().min(1)).min(1),
  dismissed: z.boolean(),
})

const possibleMatchSchema = z.object({
  smsTransactionId: z.string().min(1),
  transactionId: z.string().min(1),
})

const dismissCardPaymentsSchema = z.object({
  transactionIds: z.array(z.string().min(1)).min(1),
  dismissed: z.boolean(),
})

const bulkDeleteSchema = z.object({
  transactionIds: z
    .array(z.string().min(1))
    .min(1, 'Select at least one transaction')
    .max(MAX_BULK_TRANSACTIONS),
})

/**
 * Link transactions request schema
 */
const linkTransactionsSchema = z.object({
  transactionId1: z.string().min(1, 'Transaction ID 1 is required'),
  transactionId2: z.string().min(1, 'Transaction ID 2 is required'),
  linkType: z.enum(TRANSACTION_LINK_TYPES),
})

/**
 * Recategorize transactions request schema
 */
const recategorizeSchema = z
  .object({
    profileId: z.string().min(1, 'Profile ID is required'),
    accountId: z.string().optional(),
    statementId: z.string().optional(),
    categorizationModel: z.string().min(1, 'Categorization model is required'),
    categorizationHints: z.string().max(1000).optional(),
    includeManual: z.boolean().optional(), // If true, include manually categorized transactions
    categories: z.array(z.string()).optional(), // If set, only recategorize these categories
  })
  .refine((data) => data.accountId || data.statementId, {
    message: 'Either accountId or statementId is required',
  })

/**
 * Parse comma-separated query param into array
 */
function parseMultiValue(value: string | undefined): string[] | undefined {
  if (!value) return undefined
  const values = value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
  return values.length > 0 ? values : undefined
}

/**
 * Read the transaction list filters from the query string
 */
function parseTransactionFilters(c: Context): TransactionFilters {
  const type = c.req.query('type')
  const minAmount = c.req.query('minAmount')
  const maxAmount = c.req.query('maxAmount')
  const isSubscription = c.req.query('isSubscription')
  const reviewStatus = c.req.query('reviewStatus')

  return {
    profileId: c.req.query('profileId') || undefined,
    accountId: parseMultiValue(c.req.query('accountId')),
    statementId: parseMultiValue(c.req.query('statementId')),
    category: parseMultiValue(c.req.query('category')),
    type: type === 'credit' || type === 'debit' ? type : undefined,
    startDate: c.req.query('startDate') || undefined,
    endDate: c.req.query('endDate') || undefined,
    search: c.req.query('search') || undefined,
    minAmount: minAmount ? parseFloat(minAmount) : undefined,
    maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
    isSubscription:
      isSubscription === 'true' ? true : isSubscription === 'false' ? false : undefined,
    includeHidden: c.req.query('includeHidden') === 'true',
    onlyHidden: c.req.query('onlyHidden') === 'true',
    reviewStatus:
      reviewStatus === 'pending' ||
      reviewStatus === 'other' ||
      reviewStatus === 'low_confidence' ||
      reviewStatus === 'all'
        ? reviewStatus
        : undefined,
  }
}

/**
 * GET /transactions
 * List transactions with filters and pagination
 */
transactionRoutes.get('/', async (c) => {
  const userId = c.get('userId')

  const page = parseInt(c.req.query('page') || '1', 10)
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100)
  const sortBy = c.req.query('sortBy') as 'date' | 'amount' | 'createdAt' | undefined
  const sortOrder = c.req.query('sortOrder') as 'asc' | 'desc' | undefined

  const result = await getTransactions(userId, parseTransactionFilters(c), {
    page,
    limit,
    sortBy: sortBy || undefined,
    sortOrder: sortOrder || undefined,
  })

  return c.json(result)
})

/**
 * GET /transactions/ids
 * IDs of every transaction matching the filters, for "select all matching"
 */
transactionRoutes.get('/ids', async (c) => {
  const userId = c.get('userId')
  return c.json(await getTransactionIds(userId, parseTransactionFilters(c)))
})

/**
 * GET /transactions/stats
 * Get transaction statistics
 */
transactionRoutes.get('/stats', async (c) => {
  const userId = c.get('userId')

  const profileId = c.req.query('profileId')
  const accountId = c.req.query('accountId')
  const startDate = c.req.query('startDate')
  const endDate = c.req.query('endDate')
  const category = c.req.query('category')
  const statementId = c.req.query('statementId')
  const type = c.req.query('type')
  const search = c.req.query('search')
  const isSubscription = c.req.query('isSubscription')
  const includeHidden = c.req.query('includeHidden')
  const onlyHidden = c.req.query('onlyHidden')

  // Parse multi-value filters
  const accountIds = parseMultiValue(accountId)
  const categories = parseMultiValue(category)
  const statementIds = parseMultiValue(statementId)

  const stats = await getTransactionStats(userId, {
    profileId: profileId || undefined,
    accountId: accountIds,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    category: categories,
    statementId: statementIds,
    type: type && ['credit', 'debit'].includes(type) ? (type as 'credit' | 'debit') : undefined,
    search: search || undefined,
    isSubscription:
      isSubscription === 'true' ? true : isSubscription === 'false' ? false : undefined,
    includeHidden: includeHidden === 'true',
    onlyHidden: onlyHidden === 'true',
  })

  return c.json(stats)
})

/**
 * GET /transactions/categorization-status
 * Get current categorization status (parsing, categorizing, recategorizing)
 * NOTE: This must be defined BEFORE /:id to avoid matching "categorization-status" as an ID
 */
transactionRoutes.get('/categorization-status', (c) => {
  const status = getCategorizationStatus()
  return c.json(status)
})

/**
 * GET /transactions/duplicates
 * Find groups of likely duplicate transactions
 * NOTE: This must be defined BEFORE /:id to avoid matching "duplicates" as an ID
 */
transactionRoutes.get('/duplicates', async (c) => {
  const userId = c.get('userId')
  const dismissed = c.req.query('dismissed') === 'true'
  const groups = await findDuplicateGroups(userId, parseTransactionFilters(c), dismissed)
  return c.json({ groups })
})

/**
 * POST /transactions/duplicates/dismissed
 * Mark duplicate groups as not duplicates (or bring them back)
 */
transactionRoutes.post('/duplicates/dismissed', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))
  const result = dismissDuplicatesSchema.safeParse(body)
  if (!result.success) {
    return c.json(
      { error: 'validation_error', message: result.error.issues[0]?.message || 'Invalid request' },
      400
    )
  }
  await setDuplicatesDismissed(userId, result.data.signatures, result.data.dismissed)
  return c.json({ success: true })
})

/**
 * GET /transactions/possible-matches
 * SMS transactions that agree with a statement line on date and amount but not on the merchant
 * NOTE: This must be defined BEFORE /:id to avoid matching "possible-matches" as an ID
 */
transactionRoutes.get('/possible-matches', async (c) => {
  const userId = c.get('userId')
  const matches = await findPossibleMatches(userId, c.req.query('profileId') || undefined)
  return c.json({ matches })
})

/**
 * POST /transactions/possible-matches/confirm
 * The SMS transaction and the statement line are the same purchase
 */
transactionRoutes.post('/possible-matches/confirm', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))
  const result = possibleMatchSchema.safeParse(body)
  if (!result.success) {
    return c.json(
      { error: 'validation_error', message: result.error.issues[0]?.message || 'Invalid request' },
      400
    )
  }
  const confirmed = await confirmPossibleMatch(
    userId,
    result.data.smsTransactionId,
    result.data.transactionId
  )
  if (!confirmed) return c.json({ error: 'not_found', message: 'Match not found' }, 404)
  return c.json({ success: true })
})

/**
 * POST /transactions/possible-matches/dismiss
 * The SMS transaction and the statement line are different purchases
 */
transactionRoutes.post('/possible-matches/dismiss', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))
  const result = possibleMatchSchema.safeParse(body)
  if (!result.success) {
    return c.json(
      { error: 'validation_error', message: result.error.issues[0]?.message || 'Invalid request' },
      400
    )
  }
  const rejected = await rejectPossibleMatch(
    userId,
    result.data.smsTransactionId,
    result.data.transactionId
  )
  if (!rejected) return c.json({ error: 'not_found', message: 'Match not found' }, 404)
  return c.json({ success: true })
})

/**
 * POST /transactions/card-payments/dismissed
 * Mark card payment checks as correct (or bring them back)
 */
transactionRoutes.post('/card-payments/dismissed', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))
  const result = dismissCardPaymentsSchema.safeParse(body)
  if (!result.success) {
    return c.json(
      { error: 'validation_error', message: result.error.issues[0]?.message || 'Invalid request' },
      400
    )
  }
  await setCardPaymentsDismissed(userId, result.data.transactionIds, result.data.dismissed)
  return c.json({ success: true })
})

/**
 * GET /transactions/review-counts
 * Number of items waiting in each review queue
 * NOTE: This must be defined BEFORE /:id to avoid matching "review-counts" as an ID
 */
transactionRoutes.get('/review-counts', async (c) => {
  const userId = c.get('userId')
  const counts = await getReviewCounts(userId, c.req.query('profileId') || undefined)
  return c.json(counts)
})

/**
 * GET /transactions/:id
 * Get a specific transaction
 */
transactionRoutes.get('/:id', async (c) => {
  const userId = c.get('userId')
  const transactionId = c.req.param('id')

  const transaction = await getTransactionById(transactionId, userId)

  if (!transaction) {
    return c.json({ error: 'not_found', message: 'Transaction not found' }, 404)
  }

  return c.json({ transaction })
})

/**
 * GET /transactions/:id/link-candidates
 * Find potential transactions to link with
 */
transactionRoutes.get('/:id/link-candidates', async (c) => {
  const userId = c.get('userId')
  const transactionId = c.req.param('id')

  try {
    const candidates = await findLinkCandidates(transactionId, userId)
    return c.json({ candidates })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to find candidates'

    if (message === 'Transaction not found') {
      return c.json({ error: 'not_found', message }, 404)
    }

    return c.json({ error: 'failed', message }, 400)
  }
})

/**
 * GET /transactions/:id/link-suggestions
 * Card payment candidates: the matching card credits / bank debits, and the cards a debit may have paid
 */
transactionRoutes.get('/:id/link-suggestions', async (c) => {
  const userId = c.get('userId')
  const transactionId = c.req.param('id')

  try {
    return c.json(await getLinkSuggestions(transactionId, userId, c.req.query('category')))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to find suggestions'

    if (message === 'Transaction not found') {
      return c.json({ error: 'not_found', message }, 404)
    }

    return c.json({ error: 'failed', message }, 400)
  }
})

/**
 * PATCH /transactions/bulk
 * Update category, summary and/or hidden state on multiple transactions
 * NOTE: This must be defined BEFORE /:id to avoid matching "bulk" as an ID
 */
transactionRoutes.patch('/bulk', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))

  const result = bulkUpdateSchema.safeParse(body)
  if (!result.success) {
    return c.json(
      {
        error: 'validation_error',
        message: result.error.issues[0]?.message || 'Invalid request',
      },
      400
    )
  }

  const { transactionIds, ...data } = result.data
  const updatedCount = await bulkUpdateTransactions([...new Set(transactionIds)], userId, data)
  return c.json({ updatedCount })
})

/**
 * POST /transactions/bulk-delete
 * Permanently delete multiple transactions
 */
transactionRoutes.post('/bulk-delete', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))

  const result = bulkDeleteSchema.safeParse(body)
  if (!result.success) {
    return c.json(
      {
        error: 'validation_error',
        message: result.error.issues[0]?.message || 'Invalid request',
      },
      400
    )
  }

  const deletedCount = await bulkDeleteTransactions(
    [...new Set(result.data.transactionIds)],
    userId
  )
  return c.json({ deletedCount })
})

/**
 * PATCH /transactions/:id
 * Update a transaction (category, summary)
 */
transactionRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId')
  const transactionId = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))

  // Validate request body
  const result = updateTransactionSchema.safeParse(body)
  if (!result.success) {
    return c.json(
      {
        error: 'validation_error',
        message: result.error.issues[0]?.message || 'Invalid request',
      },
      400
    )
  }

  try {
    const transaction = await updateTransaction(transactionId, userId, result.data)
    return c.json({ transaction })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update transaction'

    if (message === 'Transaction not found') {
      return c.json({ error: 'not_found', message }, 404)
    }

    return c.json({ error: 'update_failed', message }, 400)
  }
})

/**
 * POST /transactions
 * Add a transaction by hand (cash expense, row the parser missed)
 */
transactionRoutes.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))

  const result = createTransactionSchema.safeParse(body)
  if (!result.success) {
    return c.json(
      {
        error: 'validation_error',
        message: result.error.issues[0]?.message || 'Invalid request',
      },
      400
    )
  }

  try {
    const transaction = await createManualTransaction(userId, result.data)
    return c.json({ transaction }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create transaction'

    if (message === 'Account not found') {
      return c.json({ error: 'not_found', message }, 404)
    }

    return c.json({ error: 'create_failed', message }, 400)
  }
})

/**
 * POST /transactions/link
 * Link two transactions
 */
transactionRoutes.post('/link', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))

  // Validate request body
  const result = linkTransactionsSchema.safeParse(body)
  if (!result.success) {
    return c.json(
      {
        error: 'validation_error',
        message: result.error.issues[0]?.message || 'Invalid request',
      },
      400
    )
  }

  try {
    await linkTransactions(
      result.data.transactionId1,
      result.data.transactionId2,
      result.data.linkType,
      userId
    )
    return c.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to link transactions'

    if (message.includes('not found')) {
      return c.json({ error: 'not_found', message }, 404)
    }

    return c.json({ error: 'link_failed', message }, 400)
  }
})

/**
 * DELETE /transactions/:id/link
 * Unlink a transaction
 */
transactionRoutes.delete('/:id/link', async (c) => {
  const userId = c.get('userId')
  const transactionId = c.req.param('id')

  try {
    await unlinkTransaction(transactionId, userId)
    return c.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to unlink transaction'

    if (message === 'Transaction not found') {
      return c.json({ error: 'not_found', message }, 404)
    }

    if (message === 'Transaction is not linked') {
      return c.json({ error: 'not_linked', message }, 400)
    }

    return c.json({ error: 'unlink_failed', message }, 400)
  }
})

/**
 * POST /transactions/recategorize
 * Trigger recategorization for transactions in an account or statement
 * All existing categories will be overwritten with new AI-generated categories
 */
transactionRoutes.post('/recategorize', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))

  // Validate request body
  const result = recategorizeSchema.safeParse(body)
  if (!result.success) {
    return c.json(
      {
        error: 'validation_error',
        message: result.error.issues[0]?.message || 'Invalid request',
      },
      400
    )
  }

  const {
    profileId,
    accountId,
    statementId,
    categorizationModel,
    categorizationHints,
    includeManual,
    categories,
  } = result.data

  // Verify profile belongs to user
  const profile = await getProfileById(profileId, userId)
  if (!profile) {
    return c.json({ error: 'not_found', message: 'Profile not found' }, 404)
  }

  // If accountId provided, verify it belongs to user
  if (accountId) {
    const account = await getAccountByIdRaw(accountId, userId)
    if (!account) {
      return c.json({ error: 'not_found', message: 'Account not found' }, 404)
    }
  }

  // Get user for country code
  const user = await findUserById(userId)
  if (!user || !user.country) {
    return c.json({ error: 'validation_error', message: 'User country not set' }, 400)
  }

  // Queue recategorization job
  const jobId = queueRecategorizeJob({
    profileId,
    userId,
    countryCode: user.country as CountryCode,
    accountId,
    statementId,
    categorizationModel,
    categorizationHints,
    includeManual,
    categories,
  })

  return c.json({
    success: true,
    jobId,
    message: 'Recategorization job queued',
  })
})

/**
 * GET /transactions/recategorize/:jobId
 * Get recategorization job status
 */
transactionRoutes.get('/recategorize/:jobId', async (c) => {
  const jobId = c.req.param('jobId')

  const job = getRecategorizeJobStatus(jobId)

  if (!job) {
    return c.json({ error: 'not_found', message: 'Job not found' }, 404)
  }

  return c.json({
    id: job.id,
    status: job.status,
    transactionCount: job.transactionCount,
    processedCount: job.processedCount,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  })
})

/**
 * Rename transactions request schema
 */
const renameNamesSchema = z.object({
  includeEdited: z.boolean().optional().default(false),
  model: z.string().optional(), // "provider:model"
})

/**
 * POST /transactions/rename-names
 * Rename older transactions to the clean name format (names only, categories untouched)
 */
transactionRoutes.post('/rename-names', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))

  const result = renameNamesSchema.safeParse(body)
  if (!result.success) {
    return c.json(
      {
        error: 'validation_error',
        message: result.error.issues[0]?.message || 'Invalid request',
      },
      400
    )
  }

  const user = await findUserById(userId)
  if (!user || !user.country) {
    return c.json({ error: 'validation_error', message: 'User country not set' }, 400)
  }

  const jobId = queueRenameJob({
    userId,
    countryCode: user.country as CountryCode,
    includeEdited: result.data.includeEdited,
    model: result.data.model,
  })

  return c.json({ success: true, jobId })
})

/**
 * GET /transactions/rename-names/:jobId
 * Get rename job status
 */
transactionRoutes.get('/rename-names/:jobId', async (c) => {
  const userId = c.get('userId')
  const job = getRenameJobStatus(c.req.param('jobId'), userId)

  if (!job) {
    return c.json({ error: 'not_found', message: 'Job not found' }, 404)
  }

  return c.json({
    id: job.id,
    status: job.status,
    totalCount: job.totalCount,
    renamedCount: job.renamedCount,
    skippedCount: job.skippedCount,
    failedCount: job.failedCount,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  })
})

export default transactionRoutes
