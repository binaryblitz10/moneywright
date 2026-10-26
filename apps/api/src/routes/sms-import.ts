import { Hono } from 'hono'
import { z } from 'zod/v4'
import { auth, type AuthVariables } from '../middleware/auth'
import {
  getSmsImportStatus,
  updateSmsImportSettings,
  syncSmsMessages,
  takeUnlockSyncResult,
  listPendingSms,
  listSyncedSms,
  clearSyncedSms,
  openFullDiskAccessSettings,
  importPendingSms,
  dismissPendingSms,
  restoreDismissedSms,
  isSmsImportSupported,
} from '../services/sms-import'
import { getAccountByIdRaw } from '../services/accounts'
import {
  transactionAmountSchema,
  transactionDateSchema,
  transactionTypeSchema,
} from '../lib/transaction-input'

const smsImportRoutes = new Hono<{ Variables: AuthVariables }>()

smsImportRoutes.use('*', auth())

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  aiParsing: z.boolean().optional(),
})

const syncSchema = z.object({
  since: transactionDateSchema.optional(),
})

const importSchema = z.object({
  accountId: z.string().min(1),
  date: transactionDateSchema,
  amount: transactionAmountSchema,
  currency: z.string().regex(/^[A-Za-z]{3}$/, 'Currency must be a 3-letter code'),
  type: transactionTypeSchema,
  merchant: z.string().trim().min(1, 'Merchant is required'),
})

function validationError(message: string | undefined) {
  return { error: 'validation_error', message: message || 'Invalid request' } as const
}

const notSupported = {
  error: 'not_supported',
  message: 'Reading messages is only available in the macOS app',
} as const

/**
 * GET /sms-import/status
 */
smsImportRoutes.get('/status', async (c) => {
  const status = await getSmsImportStatus(c.get('userId'))
  return c.json(status)
})

/**
 * GET /sms-import/unlock-sync - what the sync run at unlock found, once per app run
 */
smsImportRoutes.get('/unlock-sync', async (c) => {
  return c.json({ result: await takeUnlockSyncResult() })
})

/**
 * PUT /sms-import/settings
 */
smsImportRoutes.put('/settings', async (c) => {
  if (!isSmsImportSupported()) return c.json(notSupported, 400)

  const body = await c.req.json().catch(() => ({}))
  const result = settingsSchema.safeParse(body)
  if (!result.success) return c.json(validationError(result.error.issues[0]?.message), 400)

  const userId = c.get('userId')
  await updateSmsImportSettings(userId, result.data)
  return c.json(await getSmsImportStatus(userId))
})

/**
 * POST /sms-import/sync - read new messages now, or everything since a date
 */
smsImportRoutes.post('/sync', async (c) => {
  if (!isSmsImportSupported()) return c.json(notSupported, 400)

  const body = await c.req.json().catch(() => ({}))
  const parsed = syncSchema.safeParse(body)
  if (!parsed.success) return c.json(validationError(parsed.error.issues[0]?.message), 400)

  // The date is the user's local day; read from the start of that day
  const since = parsed.data.since ? new Date(`${parsed.data.since}T00:00:00`) : undefined
  const result = await syncSmsMessages(c.get('userId'), since)
  return c.json(result)
})

/**
 * DELETE /sms-import/messages - remove all synced messages and the transactions they created
 */
smsImportRoutes.delete('/messages', async (c) => {
  const result = await clearSyncedSms(c.get('userId'))
  return c.json(result)
})

/**
 * POST /sms-import/open-settings - open System Settings at Full Disk Access
 */
smsImportRoutes.post('/open-settings', (c) => {
  if (!isSmsImportSupported()) return c.json(notSupported, 400)
  openFullDiskAccessSettings()
  return c.json({ success: true })
})

/**
 * GET /sms-import/messages - every synced message, newest first
 */
smsImportRoutes.get('/messages', async (c) => {
  const messages = await listSyncedSms(c.get('userId'))
  return c.json({ messages })
})

/**
 * GET /sms-import/pending - messages waiting for the user to complete or dismiss
 */
smsImportRoutes.get('/pending', async (c) => {
  const messages = await listPendingSms(c.get('userId'))
  return c.json({ messages })
})

/**
 * POST /sms-import/pending/:id/import
 */
smsImportRoutes.post('/pending/:id/import', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const result = importSchema.safeParse(body)
  if (!result.success) return c.json(validationError(result.error.issues[0]?.message), 400)

  const userId = c.get('userId')
  const account = await getAccountByIdRaw(result.data.accountId, userId)
  if (!account) {
    return c.json({ error: 'not_found', message: 'Account not found' }, 404)
  }
  if (result.data.currency.toUpperCase() !== account.currency) {
    return c.json(
      validationError(
        `This account is in ${account.currency}. Enter the amount charged in ${account.currency}.`
      ),
      400
    )
  }

  const imported = await importPendingSms(userId, c.req.param('id'), {
    ...result.data,
    currency: result.data.currency.toUpperCase(),
  })
  if (!imported) return c.json({ error: 'not_found', message: 'Message not found' }, 404)
  return c.json({ success: true })
})

/**
 * POST /sms-import/pending/:id/dismiss
 */
smsImportRoutes.post('/pending/:id/dismiss', async (c) => {
  const dismissed = await dismissPendingSms(c.get('userId'), c.req.param('id'))
  if (!dismissed) return c.json({ error: 'not_found', message: 'Message not found' }, 404)
  return c.json({ success: true })
})

/**
 * POST /sms-import/messages/:id/restore - undo a dismissal
 */
smsImportRoutes.post('/messages/:id/restore', async (c) => {
  const restored = await restoreDismissedSms(c.get('userId'), c.req.param('id'))
  if (!restored) return c.json({ error: 'not_found', message: 'Message not found' }, 404)
  return c.json({ success: true })
})

export default smsImportRoutes
