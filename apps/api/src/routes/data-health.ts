import { Hono } from 'hono'
import { auth, type AuthVariables } from '../middleware/auth'
import { getDataHealth } from '../services/data-health'

const dataHealthRoutes = new Hono<{ Variables: AuthVariables }>()

dataHealthRoutes.use('*', auth())

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /data-health
 * Statement coverage, reconciliation and cash bridge checks
 * Query params:
 *   - profileId (optional): Limit to one profile
 *   - startDate (optional): Bridge start (YYYY-MM-DD), defaults to the financial year start
 *   - endDate (optional): Bridge end (YYYY-MM-DD), defaults to the date all accounts are covered through
 */
dataHealthRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const profileId = c.req.query('profileId') || undefined
  const startDate = c.req.query('startDate') || undefined
  const endDate = c.req.query('endDate') || undefined

  for (const date of [startDate, endDate]) {
    if (date && !DATE_PATTERN.test(date)) {
      return c.json({ error: 'invalid_date', message: 'Dates must be YYYY-MM-DD' }, 400)
    }
  }

  return c.json(await getDataHealth(userId, { profileId, startDate, endDate }))
})

export default dataHealthRoutes
