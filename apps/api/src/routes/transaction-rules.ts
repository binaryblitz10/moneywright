import { Hono } from 'hono'
import { z } from 'zod/v4'
import { auth, type AuthVariables } from '../middleware/auth'
import {
  listRules,
  createRule,
  updateRule,
  deleteRule,
  previewRule,
  RuleValidationError,
} from '../services/transaction-rules'

const transactionRuleRoutes = new Hono<{ Variables: AuthVariables }>()

// Apply auth to all routes
transactionRuleRoutes.use('*', auth())

const transactionTypeSchema = z.enum(['credit', 'debit']).nullable().optional()

const ruleSchema = z.object({
  matchTerms: z.array(z.string()),
  transactionType: transactionTypeSchema,
  name: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
})

const updateRuleSchema = ruleSchema.partial()

const previewSchema = z.object({
  matchTerms: z.array(z.string()),
  transactionType: transactionTypeSchema,
})

function validationError(message: string | undefined): {
  error: 'validation_error'
  message: string
} {
  return { error: 'validation_error', message: message || 'Invalid request' }
}

/**
 * GET /transaction-rules
 * List the user's rules (newest first) with the number of transactions each matches
 */
transactionRuleRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const rules = await listRules(userId)
  return c.json({ rules })
})

/**
 * POST /transaction-rules/preview
 * Find the transactions a set of terms would match
 * NOTE: This must be defined BEFORE /:id routes
 */
transactionRuleRoutes.post('/preview', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))

  const result = previewSchema.safeParse(body)
  if (!result.success) {
    return c.json(validationError(result.error.issues[0]?.message), 400)
  }

  return c.json(await previewRule(userId, result.data))
})

/**
 * POST /transaction-rules
 * Create a rule
 */
transactionRuleRoutes.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))

  const result = ruleSchema.safeParse(body)
  if (!result.success) {
    return c.json(validationError(result.error.issues[0]?.message), 400)
  }

  try {
    const rule = await createRule(userId, result.data)
    return c.json({ rule }, 201)
  } catch (error) {
    if (error instanceof RuleValidationError) {
      return c.json(validationError(error.message), 400)
    }
    throw error
  }
})

/**
 * PATCH /transaction-rules/:id
 * Update a rule
 */
transactionRuleRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))

  const result = updateRuleSchema.safeParse(body)
  if (!result.success) {
    return c.json(validationError(result.error.issues[0]?.message), 400)
  }

  try {
    const rule = await updateRule(userId, c.req.param('id'), result.data)
    if (!rule) {
      return c.json({ error: 'not_found', message: 'Rule not found' }, 404)
    }
    return c.json({ rule })
  } catch (error) {
    if (error instanceof RuleValidationError) {
      return c.json(validationError(error.message), 400)
    }
    throw error
  }
})

/**
 * DELETE /transaction-rules/:id
 * Delete a rule
 */
transactionRuleRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const deleted = await deleteRule(userId, c.req.param('id'))
  if (!deleted) {
    return c.json({ error: 'not_found', message: 'Rule not found' }, 404)
  }
  return c.json({ success: true })
})

export default transactionRuleRoutes
