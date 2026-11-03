import { Hono } from 'hono'
import { z } from 'zod/v4'
import { auth, type AuthVariables } from '../middleware/auth'
import { getProfileById } from '../services/profiles'
import {
  getLearnedNotes,
  saveLearnedNotes,
  refreshLearnedNotes,
  resetLearnedNotes,
} from '../services/learned-notes'
import {
  getLearningStats,
  searchLearnedMerchants,
  forgetMerchant,
} from '../services/categorization-learning'

const categorizationRoutes = new Hono<{ Variables: AuthVariables }>()

categorizationRoutes.use('*', auth())

const profileBodySchema = z.object({ profileId: z.string().min(1, 'Profile ID is required') })
const saveNotesSchema = profileBodySchema.extend({ notes: z.string() })
const forgetSchema = z.object({ fingerprint: z.string().min(1, 'Fingerprint is required') })

function validationError(message: string | undefined): {
  error: 'validation_error'
  message: string
} {
  return { error: 'validation_error', message: message || 'Invalid request' }
}

const notFound = { error: 'not_found', message: 'Profile not found' } as const

/**
 * GET /categorization/notes?profileId=
 * The notes about the user kept for a profile
 */
categorizationRoutes.get('/notes', async (c) => {
  const userId = c.get('userId')
  const profileId = c.req.query('profileId')
  if (!profileId) return c.json(validationError('Profile ID is required'), 400)
  if (!(await getProfileById(profileId, userId))) return c.json(notFound, 404)

  return c.json({ notes: await getLearnedNotes(userId, profileId) })
})

/**
 * PUT /categorization/notes
 * Save the user's own edit of the notes (empty clears them)
 */
categorizationRoutes.put('/notes', async (c) => {
  const userId = c.get('userId')
  const result = saveNotesSchema.safeParse(await c.req.json().catch(() => ({})))
  if (!result.success) return c.json(validationError(result.error.issues[0]?.message), 400)
  const { profileId, notes } = result.data
  if (!(await getProfileById(profileId, userId))) return c.json(notFound, 404)

  return c.json({ notes: await saveLearnedNotes(userId, profileId, notes) })
})

/**
 * POST /categorization/notes/refresh
 * Rewrite the notes from the profile's data now
 */
categorizationRoutes.post('/notes/refresh', async (c) => {
  const userId = c.get('userId')
  const result = profileBodySchema.safeParse(await c.req.json().catch(() => ({})))
  if (!result.success) return c.json(validationError(result.error.issues[0]?.message), 400)
  const { profileId } = result.data
  if (!(await getProfileById(profileId, userId))) return c.json(notFound, 404)

  return c.json({ notes: await refreshLearnedNotes(userId, profileId) })
})

/**
 * POST /categorization/notes/reset
 * Clear the notes
 */
categorizationRoutes.post('/notes/reset', async (c) => {
  const userId = c.get('userId')
  const result = profileBodySchema.safeParse(await c.req.json().catch(() => ({})))
  if (!result.success) return c.json(validationError(result.error.issues[0]?.message), 400)
  const { profileId } = result.data
  if (!(await getProfileById(profileId, userId))) return c.json(notFound, 404)

  await resetLearnedNotes(userId, profileId)
  return c.json({ notes: null })
})

/**
 * GET /categorization/stats?profileId=
 * What the categorizer has learned and how well it is doing
 */
categorizationRoutes.get('/stats', async (c) => {
  const userId = c.get('userId')
  const profileId = c.req.query('profileId') || undefined
  if (profileId && !(await getProfileById(profileId, userId))) return c.json(notFound, 404)

  return c.json(await getLearningStats(userId, profileId))
})

/**
 * GET /categorization/merchants?q=
 * Merchants the categorizer has learned that match the search
 */
categorizationRoutes.get('/merchants', async (c) => {
  const userId = c.get('userId')
  return c.json({ merchants: await searchLearnedMerchants(userId, c.req.query('q') ?? '') })
})

/**
 * POST /categorization/merchants/forget
 * Stop treating a merchant's categories and names as confirmed by the user
 */
categorizationRoutes.post('/merchants/forget', async (c) => {
  const userId = c.get('userId')
  const result = forgetSchema.safeParse(await c.req.json().catch(() => ({})))
  if (!result.success) return c.json(validationError(result.error.issues[0]?.message), 400)

  return c.json({ updated: await forgetMerchant(userId, result.data.fingerprint) })
})

export default categorizationRoutes
