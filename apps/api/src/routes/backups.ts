import { Hono, type Context } from 'hono'
import { z } from 'zod/v4'
import type { Database } from 'bun:sqlite'
import { auth, type AuthVariables } from '../middleware/auth'
import { client, dbType } from '../db'
import {
  buildBackupFile,
  createManualBackup,
  exportBackupToDownloads,
  exportFileName,
  isValidBackupName,
  listBackups,
  stageRestore,
} from '../services/backups'
import { MIN_PASSPHRASE_LENGTH } from '../lib/backup-crypto'
import { logger } from '../lib/logger'

const backupRoutes = new Hono<{ Variables: AuthVariables }>()

backupRoutes.use('*', auth())

const unsupported = { error: 'unsupported', message: 'Backups are not available for PostgreSQL' }

/**
 * GET /backups
 * List backups (empty with supported=false on PostgreSQL)
 */
backupRoutes.get('/', (c) => {
  if (dbType !== 'sqlite') return c.json({ supported: false, backups: [] })
  return c.json({ supported: true, backups: listBackups() })
})

/**
 * POST /backups
 * Create a manual backup now
 */
backupRoutes.post('/', (c) => {
  if (dbType !== 'sqlite') return c.json(unsupported, 400)
  try {
    return c.json({ backup: createManualBackup(client as Database) }, 201)
  } catch (error) {
    logger.error('Failed to create backup:', error)
    return c.json({ error: 'backup_failed', message: 'Could not create the backup' }, 500)
  }
})

const passphraseSchema = z.object({
  passphrase: z
    .string()
    .min(MIN_PASSPHRASE_LENGTH, `Use at least ${MIN_PASSPHRASE_LENGTH} characters`),
})

/** Validate the :name param and the passphrase body shared by download and export */
async function parseBackupRequest(
  c: Context
): Promise<{ name: string; passphrase: string } | Response> {
  const name = c.req.param('name') ?? ''
  if (!isValidBackupName(name)) {
    return c.json({ error: 'invalid_name', message: 'Invalid backup name' }, 400)
  }
  const body = passphraseSchema.safeParse(await c.req.json().catch(() => ({})))
  if (!body.success) {
    return c.json(
      { error: 'validation_error', message: body.error.issues[0]?.message ?? 'Invalid request' },
      400
    )
  }
  return { name, passphrase: body.data.passphrase }
}

/**
 * POST /backups/:name/download
 * Download the backup (with the key needed to read it) as a file locked with a passphrase
 */
backupRoutes.post('/:name/download', async (c) => {
  if (dbType !== 'sqlite') return c.json(unsupported, 400)
  const request = await parseBackupRequest(c)
  if (request instanceof Response) return request

  const file = await buildBackupFile(request.name, request.passphrase)
  if (!file) return c.json({ error: 'not_found', message: 'Backup not found' }, 404)

  const fileName = exportFileName(request.name, () => false)
  return new Response(new Blob([new Uint8Array(file)], { type: 'application/octet-stream' }), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
})

/**
 * POST /backups/:name/export
 * Save the passphrase-protected file to the Downloads folder (for the desktop app, which cannot download files)
 */
backupRoutes.post('/:name/export', async (c) => {
  if (dbType !== 'sqlite') return c.json(unsupported, 400)
  const request = await parseBackupRequest(c)
  if (request instanceof Response) return request

  const path = await exportBackupToDownloads(request.name, request.passphrase)
  if (!path) return c.json({ error: 'not_found', message: 'Backup not found' }, 404)
  return c.json({ path })
})

/**
 * POST /backups/:name/restore
 * Schedule a restore; it is applied the next time the app starts
 */
backupRoutes.post('/:name/restore', (c) => {
  if (dbType !== 'sqlite') return c.json(unsupported, 400)
  const name = c.req.param('name')
  if (!isValidBackupName(name)) {
    return c.json({ error: 'invalid_name', message: 'Invalid backup name' }, 400)
  }
  if (!stageRestore(name)) return c.json({ error: 'not_found', message: 'Backup not found' }, 404)

  return c.json({
    success: true,
    message: 'Restore scheduled. Quit and reopen the app to finish restoring.',
  })
})

export default backupRoutes
