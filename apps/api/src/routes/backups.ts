import { Hono } from 'hono'
import type { Database } from 'bun:sqlite'
import { auth, type AuthVariables } from '../middleware/auth'
import { client, dbType } from '../db'
import {
  buildBackupZip,
  createManualBackup,
  exportBackupToDownloads,
  isValidBackupName,
  listBackups,
  stageRestore,
} from '../services/backups'
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

/**
 * GET /backups/:name/download
 * Download a zip with the backup and the .env needed to read it
 */
backupRoutes.get('/:name/download', (c) => {
  if (dbType !== 'sqlite') return c.json(unsupported, 400)
  const name = c.req.param('name')
  if (!isValidBackupName(name)) {
    return c.json({ error: 'invalid_name', message: 'Invalid backup name' }, 400)
  }

  const zip = buildBackupZip(name)
  if (!zip) return c.json({ error: 'not_found', message: 'Backup not found' }, 404)

  return new Response(new Blob([new Uint8Array(zip)], { type: 'application/zip' }), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${name.replace(/\.db$/, '')}.zip"`,
    },
  })
})

/**
 * POST /backups/:name/export
 * Save the download zip to the Downloads folder (for the desktop app, which cannot download files)
 */
backupRoutes.post('/:name/export', (c) => {
  if (dbType !== 'sqlite') return c.json(unsupported, 400)
  const name = c.req.param('name')
  if (!isValidBackupName(name)) {
    return c.json({ error: 'invalid_name', message: 'Invalid backup name' }, 400)
  }
  const path = exportBackupToDownloads(name)
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
