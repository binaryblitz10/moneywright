import { Hono } from 'hono'
import { z } from 'zod/v4'
import { auth, type AuthVariables } from '../middleware/auth'
import type { CountryCode } from '../lib/constants'
import { applyFixes, listBatches, previewFixes, undoBatch, undoChange } from '../services/auto-fix'
import type { FixContext } from '../services/auto-fix'
import { getPreference, PREFERENCE_KEYS } from '../services/preferences'
import { getProfileById } from '../services/profiles'
import { findUserById } from '../services/user'

const autoFixRoutes = new Hono<{ Variables: AuthVariables }>()

autoFixRoutes.use('*', auth())

const applySchema = z.object({
  profileId: z.string().optional(),
  fixerIds: z.array(z.string()).optional(),
  fixIds: z.array(z.string()).optional(),
})

type ContextResult =
  | { ctx: FixContext }
  | { error: { error: string; message: string }; status: 400 | 404 }

/** Who is fixed and with which categorization model (the saved one, else the first configured) */
async function contextFor(userId: string, profileId?: string): Promise<ContextResult> {
  if (profileId && !(await getProfileById(profileId, userId))) {
    return { error: { error: 'not_found', message: 'Profile not found' }, status: 404 }
  }
  const user = await findUserById(userId)
  if (!user?.country) {
    return { error: { error: 'validation_error', message: 'User country not set' }, status: 400 }
  }
  const [provider, model] = await Promise.all([
    getPreference(userId, PREFERENCE_KEYS.STATEMENT_CATEGORISATION_PROVIDER, profileId),
    getPreference(userId, PREFERENCE_KEYS.STATEMENT_CATEGORISATION_MODEL, profileId),
  ])
  return {
    ctx: {
      userId,
      profileId,
      countryCode: user.country as CountryCode,
      model: provider && model ? `${provider}:${model}` : undefined,
    },
  }
}

/**
 * GET /auto-fix/preview
 * What each fixer would fix right now, without changing anything
 * Query params:
 *   - profileId (optional): Limit to one profile
 */
autoFixRoutes.get('/preview', async (c) => {
  const found = await contextFor(c.get('userId'), c.req.query('profileId') || undefined)
  if ('error' in found) return c.json(found.error, found.status)
  return c.json({ fixers: await previewFixes(found.ctx) })
})

/**
 * POST /auto-fix/apply
 * Apply fixes the user asked for (safe or not) as one undoable batch
 * Body: { profileId?, fixerIds?, fixIds? } - everything found when neither list is given
 */
autoFixRoutes.post('/apply', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const result = applySchema.safeParse(body)
  if (!result.success) {
    return c.json(
      { error: 'validation_error', message: result.error.issues[0]?.message || 'Invalid request' },
      400
    )
  }
  const { profileId, fixerIds, fixIds } = result.data

  const found = await contextFor(c.get('userId'), profileId)
  if ('error' in found) return c.json(found.error, found.status)
  return c.json(await applyFixes(found.ctx, { fixerIds, fixIds, trigger: 'manual' }))
})

/**
 * GET /auto-fix/batches
 * The latest batches of fixes with their changes, newest first
 * Query params:
 *   - profileId (optional): Limit to one profile
 */
autoFixRoutes.get('/batches', async (c) => {
  const batches = await listBatches(c.get('userId'), c.req.query('profileId') || undefined)
  return c.json({ batches })
})

/**
 * POST /auto-fix/batches/:id/undo
 * Undo every change of a batch that was not edited since
 */
autoFixRoutes.post('/batches/:id/undo', async (c) => {
  const result = await undoBatch(c.get('userId'), c.req.param('id'))
  if (!result) return c.json({ error: 'not_found', message: 'Batch not found' }, 404)
  return c.json(result)
})

/**
 * POST /auto-fix/changes/:id/undo
 * Undo one change, unless its row was edited since
 */
autoFixRoutes.post('/changes/:id/undo', async (c) => {
  const result = await undoChange(c.get('userId'), c.req.param('id'))
  if (!result) return c.json({ error: 'not_found', message: 'Change not found' }, 404)
  return c.json(result)
})

export default autoFixRoutes
