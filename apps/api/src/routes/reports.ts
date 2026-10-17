import { Hono } from 'hono'
import { z } from 'zod/v4'
import { auth, type AuthVariables } from '../middleware/auth'
import { getInvestmentsReport } from '../services/reports/investments'
import { getPeriodReport } from '../services/reports/period'
import { getReportBounds, MONTH_PATTERN, validateMonthRange } from '../services/reports/shared'
import { getTrendsReport } from '../services/reports/trends'

const reportRoutes = new Hono<{ Variables: AuthVariables }>()

// Apply auth to all routes
reportRoutes.use('*', auth())

const monthSchema = z.string().regex(MONTH_PATTERN, 'Must be YYYY-MM')

const rangeSchema = z.object({
  from: monthSchema,
  to: monthSchema,
  profileId: z.string().optional(),
})

type RangeQuery = z.infer<typeof rangeSchema>

/** Parsed, validated query, or the message to answer a 400 with */
async function parseRange(
  userId: string,
  query: Record<string, string>
): Promise<{ query: RangeQuery } | { message: string }> {
  const parsed = rangeSchema.safeParse({ ...query, profileId: query.profileId || undefined })
  if (!parsed.success) {
    return {
      message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    }
  }
  const bounds = await getReportBounds(userId, parsed.data.profileId)
  const problem = validateMonthRange(parsed.data.from, parsed.data.to, bounds)
  return problem ? { message: problem } : { query: parsed.data }
}

/**
 * GET /reports/months
 * The months a report can cover
 * Query params:
 *   - profileId (optional): Limit to one profile
 * Returns { earliestMonth, lastCompleteMonth } (YYYY-MM; earliestMonth is null without data)
 */
reportRoutes.get('/months', async (c) => {
  const userId = c.get('userId')
  return c.json(await getReportBounds(userId, c.req.query('profileId') || undefined))
})

/**
 * GET /reports/period
 * Totals, categories, shops and accounts for complete months vs the months before
 * Query params:
 *   - from, to (required): First and last month (YYYY-MM); to must be a finished month
 *   - profileId (optional): Limit to one profile
 */
reportRoutes.get('/period', async (c) => {
  const userId = c.get('userId')
  const parsed = await parseRange(userId, c.req.query())
  if ('message' in parsed)
    return c.json({ error: 'validation_error', message: parsed.message }, 400)
  return c.json(await getPeriodReport(userId, parsed.query))
})

/**
 * GET /reports/trends
 * Month-by-month spending by category, shop and account
 * Query params: same as /reports/period
 */
reportRoutes.get('/trends', async (c) => {
  const userId = c.get('userId')
  const parsed = await parseRange(userId, c.req.query())
  if ('message' in parsed)
    return c.json({ error: 'validation_error', message: parsed.message }, 400)
  return c.json(await getTrendsReport(userId, parsed.query))
})

/**
 * GET /reports/investments
 * Money put into investments, per platform, with current values
 * Query params: same as /reports/period
 */
reportRoutes.get('/investments', async (c) => {
  const userId = c.get('userId')
  const parsed = await parseRange(userId, c.req.query())
  if ('message' in parsed)
    return c.json({ error: 'validation_error', message: parsed.message }, 400)
  return c.json(await getInvestmentsReport(userId, parsed.query))
})

export default reportRoutes
