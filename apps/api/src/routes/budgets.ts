import { Hono } from 'hono'
import { z } from 'zod/v4'
import { auth, type AuthVariables } from '../middleware/auth'
import { isMonth } from '../lib/budgets'
import {
  BudgetValidationError,
  createBudget,
  deleteBudget,
  getBudgetSummary,
  updateBudget,
} from '../services/budgets'
import { getProfileById } from '../services/profiles'

const budgetRoutes = new Hono<{ Variables: AuthVariables }>()

budgetRoutes.use('*', auth())

const createSchema = z.object({
  category: z.string().min(1),
  monthlyAmount: z.number().positive(),
  rollover: z.boolean().optional(),
})

const updateSchema = z.object({
  monthlyAmount: z.number().positive().optional(),
  rollover: z.boolean().optional(),
})

function validationError(message: string | undefined): {
  error: 'validation_error'
  message: string
} {
  return { error: 'validation_error', message: message || 'Invalid request' }
}

/** Current month as YYYY-MM */
function currentMonth(): string {
  return new Date().toISOString().substring(0, 7)
}

/**
 * GET /budgets/profiles/:profileId?month=YYYY-MM
 * A profile's budgets with spending so far in the month (default: this month)
 */
budgetRoutes.get('/profiles/:profileId', async (c) => {
  const userId = c.get('userId')
  const profileId = c.req.param('profileId')
  const month = c.req.query('month') || currentMonth()

  if (!isMonth(month)) {
    return c.json(validationError('month must be YYYY-MM'), 400)
  }
  if (!(await getProfileById(profileId, userId))) {
    return c.json({ error: 'not_found', message: 'Profile not found' }, 404)
  }

  return c.json(await getBudgetSummary(userId, profileId, month))
})

/**
 * POST /budgets/profiles/:profileId
 * Set a monthly budget for a spending category
 */
budgetRoutes.post('/profiles/:profileId', async (c) => {
  const userId = c.get('userId')
  const profileId = c.req.param('profileId')
  const body = await c.req.json().catch(() => ({}))

  const result = createSchema.safeParse(body)
  if (!result.success) {
    return c.json(validationError(result.error.issues[0]?.message), 400)
  }
  if (!(await getProfileById(profileId, userId))) {
    return c.json({ error: 'not_found', message: 'Profile not found' }, 404)
  }

  try {
    return c.json({ budget: await createBudget(userId, profileId, result.data) }, 201)
  } catch (error) {
    if (error instanceof BudgetValidationError) {
      return c.json(validationError(error.message), 400)
    }
    throw error
  }
})

/**
 * PATCH /budgets/:id
 * Change a budget's amount or rollover
 */
budgetRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))

  const result = updateSchema.safeParse(body)
  if (!result.success) {
    return c.json(validationError(result.error.issues[0]?.message), 400)
  }

  try {
    const budget = await updateBudget(userId, c.req.param('id'), result.data)
    if (!budget) {
      return c.json({ error: 'not_found', message: 'Budget not found' }, 404)
    }
    return c.json({ budget })
  } catch (error) {
    if (error instanceof BudgetValidationError) {
      return c.json(validationError(error.message), 400)
    }
    throw error
  }
})

/**
 * DELETE /budgets/:id
 */
budgetRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId')
  if (!(await deleteBudget(userId, c.req.param('id')))) {
    return c.json({ error: 'not_found', message: 'Budget not found' }, 404)
  }
  return c.json({ success: true })
})

export default budgetRoutes
