import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  countPendingMigrations,
  exportFileName,
  getBackupKind,
  getPendingMigrationCount,
  isValidBackupName,
  selectBackupsToPrune,
} from './backups'

describe('isValidBackupName', () => {
  test('accepts generated names', () => {
    expect(isValidBackupName('app-manual-2026-01-31T10-20-30-123Z.db')).toBe(true)
    expect(isValidBackupName('app-pre-migration-2026-01-31T10-20-30-123Z.db')).toBe(true)
    expect(isValidBackupName('app-before-restore-2026-01-31T10-20-30-123Z.db')).toBe(true)
  })

  test('rejects traversal and unexpected names', () => {
    for (const name of [
      '../app.db',
      '..%2Fapp.db',
      'app-manual-2026-01-31T10-20-30-123Z.db/../../x',
      '/etc/passwd',
      'app.db',
      'app-manual-2026-01-31T10-20-30-123Z.db-wal',
      'app-other-2026-01-31T10-20-30-123Z.db',
      '',
    ]) {
      expect(isValidBackupName(name)).toBe(false)
    }
  })
})

describe('getBackupKind', () => {
  test('manual vs auto', () => {
    expect(getBackupKind('app-manual-x.db')).toBe('manual')
    expect(getBackupKind('app-pre-migration-x.db')).toBe('auto')
    expect(getBackupKind('app-before-restore-x.db')).toBe('before-restore')
  })
})

describe('selectBackupsToPrune', () => {
  const auto = (i: number) =>
    `app-pre-migration-2026-01-${String(i).padStart(2, '0')}T00-00-00-000Z.db`

  test('keeps the newest 10 automatic backups', () => {
    const names = Array.from({ length: 13 }, (_, i) => auto(i + 1))
    expect(selectBackupsToPrune(names)).toEqual([auto(1), auto(2), auto(3)])
  })

  test('does nothing at or under the limit', () => {
    expect(selectBackupsToPrune(Array.from({ length: 10 }, (_, i) => auto(i + 1)))).toEqual([])
  })

  test('never touches manual or safety backups', () => {
    const names = [
      'app-manual-2026-01-01T00-00-00-000Z.db',
      'app-before-restore-2026-01-01T00-00-00-000Z.db',
      auto(1),
      auto(2),
    ]
    expect(selectBackupsToPrune(names, 1)).toEqual([auto(1)])
  })
})

describe('countPendingMigrations', () => {
  test('all pending when nothing applied', () => {
    expect(countPendingMigrations([1, 2, 3], null)).toBe(3)
  })

  test('only entries newer than the latest applied', () => {
    expect(countPendingMigrations([1, 2, 3], 2)).toBe(1)
    expect(countPendingMigrations([1, 2, 3], 3)).toBe(0)
  })
})

describe('getPendingMigrationCount', () => {
  const folder = mkdtempSync(join(tmpdir(), 'mw-migrations-'))
  mkdirSync(join(folder, 'meta'))
  writeFileSync(
    join(folder, 'meta', '_journal.json'),
    JSON.stringify({ entries: [{ when: 100 }, { when: 200 }, { when: 300 }] })
  )

  test('new database without migrations table needs no backup', () => {
    expect(getPendingMigrationCount(new Database(':memory:'), folder)).toBe(0)
  })

  test('counts migrations newer than the applied ones', () => {
    const sqlite = new Database(':memory:')
    sqlite.run(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT, created_at NUMERIC)'
    )
    sqlite.run("INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('a', 100), ('b', 200)")
    expect(getPendingMigrationCount(sqlite, folder)).toBe(1)
    sqlite.run("INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('c', 300)")
    expect(getPendingMigrationCount(sqlite, folder)).toBe(0)
  })
})

describe('exportFileName', () => {
  const name = 'app-manual-2026-01-31T10-20-30-123Z.db'
  test('uses the backup timestamp', () => {
    expect(exportFileName(name, () => false)).toBe(
      'moneywright-backup-2026-01-31T10-20-30-123Z.zip'
    )
  })
  test('avoids overwriting existing files', () => {
    const taken = new Set([
      'moneywright-backup-2026-01-31T10-20-30-123Z.zip',
      'moneywright-backup-2026-01-31T10-20-30-123Z-2.zip',
    ])
    expect(exportFileName(name, (f) => taken.has(f))).toBe(
      'moneywright-backup-2026-01-31T10-20-30-123Z-3.zip'
    )
  })
})
