/**
 * Database backups (SQLite only)
 *
 * Handles automatic backups before migrations, manual backups, zip export
 * and staged restores. This module must not import `../db`, because the
 * database module uses it before the connection is opened. Functions that
 * need the database take the connection as a parameter.
 */

import { Database } from 'bun:sqlite'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs'
import { homedir } from 'os'
import { basename, dirname, join, resolve } from 'path'
import { zipSync } from 'fflate'
import { getDataDir, getSqlitePath } from '../lib/startup'
import { logger } from '../lib/logger'

export type BackupKind = 'auto' | 'manual' | 'before-restore'

export interface BackupInfo {
  name: string
  size: number
  createdAt: string
  kind: BackupKind
}

interface RestoreMarker {
  name: string
  requestedAt: string
}

const MAX_AUTO_BACKUPS = 10
const PRE_MIGRATION_PREFIX = 'app-pre-migration-'
const MANUAL_PREFIX = 'app-manual-'
const BEFORE_RESTORE_PREFIX = 'app-before-restore-'
const RESTORE_MARKER = 'restore-pending.json'

// app-<pre-migration|manual|before-restore>-2026-01-31T10-20-30-123Z.db
const BACKUP_NAME_PATTERN =
  /^app-(pre-migration|manual|before-restore)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.db$/

/**
 * Root folder that holds the data/ folder, backups/ folder and restore marker.
 */
function getStorageRoot(): string {
  return resolve(dirname(getSqlitePath()), '..')
}

export function getBackupsDir(): string {
  return join(getStorageRoot(), 'backups')
}

function getRestoreMarkerPath(): string {
  return join(getStorageRoot(), RESTORE_MARKER)
}

/**
 * Strict check for backup file names, so a name can never point outside the backups folder.
 */
export function isValidBackupName(name: string): boolean {
  return BACKUP_NAME_PATTERN.test(name)
}

export function getBackupKind(name: string): BackupKind {
  if (name.startsWith(MANUAL_PREFIX)) return 'manual'
  if (name.startsWith(BEFORE_RESTORE_PREFIX)) return 'before-restore'
  return 'auto'
}

function timestamp(): string {
  return new Date().toISOString().replace(/:/g, '-').replace('.', '-')
}

/**
 * Decide how many of the given migration timestamps still need to run.
 * Drizzle applies every journal entry newer than the latest applied one.
 * `lastApplied` is null when nothing has been applied yet.
 */
export function countPendingMigrations(journalTimes: number[], lastApplied: number | null): number {
  if (lastApplied === null) return journalTimes.length
  return journalTimes.filter((when) => when > lastApplied).length
}

/**
 * Number of migrations that have not been applied to an existing database.
 * Returns 0 for a brand new database (no migrations table yet), as it has nothing to protect.
 */
export function getPendingMigrationCount(sqlite: Database, migrationsFolder: string): number {
  const journalPath = join(migrationsFolder, 'meta', '_journal.json')
  if (!existsSync(journalPath)) return 0

  const table = sqlite
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'")
    .get()
  if (!table) return 0

  const journal = JSON.parse(readFileSync(journalPath, 'utf-8')) as {
    entries: { when: number }[]
  }
  const row = sqlite.query('SELECT MAX(created_at) AS last FROM __drizzle_migrations').get() as {
    last: number | null
  } | null

  return countPendingMigrations(
    journal.entries.map((entry) => entry.when),
    row?.last ?? null
  )
}

/**
 * Pick the automatic backups to delete so only the newest `keep` remain.
 * Names carry a sortable timestamp, so sorting by name sorts by age.
 */
export function selectBackupsToPrune(names: string[], keep: number = MAX_AUTO_BACKUPS): string[] {
  const autoBackups = names.filter((n) => n.startsWith(PRE_MIGRATION_PREFIX)).sort()
  return autoBackups.slice(0, Math.max(0, autoBackups.length - keep))
}

/**
 * Write a consistent copy of the live database into the backups folder.
 */
function writeBackup(sqlite: Database, prefix: string): string {
  const dir = getBackupsDir()
  mkdirSync(dir, { recursive: true })
  const name = `${prefix}${timestamp()}.db`
  const target = join(dir, name)
  // VACUUM INTO takes a string literal, so quote it by doubling single quotes
  sqlite.run(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
  return target
}

function pruneAutoBackups(): void {
  const dir = getBackupsDir()
  for (const name of selectBackupsToPrune(readdirSync(dir))) {
    rmSync(join(dir, name), { force: true })
  }
}

/**
 * Back up the database before migrations run, if any are pending.
 * Returns the backup path, or null when no backup was needed.
 */
export function backupBeforeMigrations(sqlite: Database, migrationsFolder: string): string | null {
  if (getPendingMigrationCount(sqlite, migrationsFolder) === 0) return null

  const target = writeBackup(sqlite, PRE_MIGRATION_PREFIX)
  pruneAutoBackups()
  logger.info(`[DB] Backed up database before migrating: ${target}`)
  return target
}

export function createManualBackup(sqlite: Database): BackupInfo {
  const target = writeBackup(sqlite, MANUAL_PREFIX)
  return describeBackup(target)
}

function describeBackup(path: string): BackupInfo {
  const stats = statSync(path)
  const name = basename(path)
  return {
    name,
    size: stats.size,
    createdAt: stats.mtime.toISOString(),
    kind: getBackupKind(name),
  }
}

export function listBackups(): BackupInfo[] {
  const dir = getBackupsDir()
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter(isValidBackupName)
    .map((name) => describeBackup(join(dir, name)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * Build a zip with the backup and the current .env (holds the key needed to read the backup).
 * Returns null if the backup does not exist.
 */
export function buildBackupZip(name: string): Uint8Array | null {
  if (!isValidBackupName(name)) return null
  const path = join(getBackupsDir(), name)
  if (!existsSync(path)) return null

  const files: Record<string, Uint8Array> = { [name]: readFileSync(path) }
  const envPath = join(getDataDir(), '.env')
  if (existsSync(envPath)) {
    files['.env'] = readFileSync(envPath)
  }
  // Database files are already compact; skip compression for speed
  return zipSync(files, { level: 0 })
}

/**
 * Schedule a restore for the next start. Returns false if the backup does not exist.
 */
export function stageRestore(name: string): boolean {
  if (!isValidBackupName(name) || !existsSync(join(getBackupsDir(), name))) return false

  const marker: RestoreMarker = { name, requestedAt: new Date().toISOString() }
  writeFileSync(getRestoreMarkerPath(), JSON.stringify(marker), 'utf-8')
  return true
}

/**
 * Apply a staged restore. Must run before the database connection is opened.
 */
export function applyPendingRestore(): void {
  const markerPath = getRestoreMarkerPath()
  if (!existsSync(markerPath)) return

  const sqlitePath = getSqlitePath()
  try {
    const marker = JSON.parse(readFileSync(markerPath, 'utf-8')) as RestoreMarker
    if (!isValidBackupName(marker.name)) {
      throw new Error(`Invalid backup name in restore marker: ${marker.name}`)
    }
    const source = join(getBackupsDir(), marker.name)
    if (!existsSync(source)) {
      throw new Error(`Backup file not found: ${source}`)
    }

    // Keep a safety copy of the current data, including any unmerged WAL file
    let safetyCopy: string | null = null
    if (existsSync(sqlitePath)) {
      mkdirSync(getBackupsDir(), { recursive: true })
      safetyCopy = join(getBackupsDir(), `${BEFORE_RESTORE_PREFIX}${timestamp()}.db`)
      // VACUUM INTO folds in the WAL, so the copy is one complete, standalone file
      const current = new Database(sqlitePath)
      try {
        current.run(`VACUUM INTO '${safetyCopy.replace(/'/g, "''")}'`)
      } finally {
        current.close()
      }
    }

    // Stale WAL/SHM frames would be replayed on top of the restored file
    rmSync(`${sqlitePath}-wal`, { force: true })
    rmSync(`${sqlitePath}-shm`, { force: true })
    mkdirSync(dirname(sqlitePath), { recursive: true })
    copyFileSync(source, sqlitePath)

    logger.info(
      `[DB] Restored database from ${marker.name}` +
        (safetyCopy ? ` (previous data saved to ${safetyCopy})` : '')
    )
  } catch (error) {
    logger.error('[DB] Could not restore backup, keeping current data:', error)
  } finally {
    rmSync(markerPath, { force: true })
  }
}

/**
 * Pick a zip file name for exporting a backup that does not overwrite an existing file.
 */
export function exportFileName(backupName: string, exists: (fileName: string) => boolean): string {
  const stamp = backupName
    .replace(/^app-(pre-migration|manual|before-restore)-/, '')
    .replace(/\.db$/, '')
  const base = `moneywright-backup-${stamp}`
  let fileName = `${base}.zip`
  for (let n = 2; exists(fileName); n++) fileName = `${base}-${n}.zip`
  return fileName
}

/**
 * Save the backup zip to the user's Downloads folder and show it in the file manager.
 * Returns the saved path, or null if the backup does not exist.
 */
export function exportBackupToDownloads(name: string): string | null {
  const zip = buildBackupZip(name)
  if (!zip) return null

  const dir = join(homedir(), 'Downloads')
  mkdirSync(dir, { recursive: true })
  const file = join(
    dir,
    exportFileName(name, (f) => existsSync(join(dir, f)))
  )
  writeFileSync(file, zip)
  revealInFileManager(file, dir)
  return file
}

function revealInFileManager(file: string, dir: string): void {
  const command =
    process.platform === 'darwin'
      ? ['open', '-R', file]
      : process.platform === 'win32'
        ? ['explorer', `/select,${file}`]
        : ['xdg-open', dir]
  try {
    Bun.spawn(command, { stdout: 'ignore', stderr: 'ignore' })
  } catch {
    // Showing the file is a convenience; the export itself succeeded
  }
}
