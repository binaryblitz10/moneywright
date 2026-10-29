import { drizzle as drizzlePg, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { drizzle as drizzleSqlite } from 'drizzle-orm/bun-sqlite'
import { migrate as migrateSqlite } from 'drizzle-orm/bun-sqlite/migrator'
import { migrate as migratePg } from 'drizzle-orm/postgres-js/migrator'
import { Database } from 'bun:sqlite'
import postgres from 'postgres'
import { existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

import * as pgSchema from './schema.pg'
import * as sqliteSchema from './schema.sqlite'
import { logger } from '../lib/logger'
import { normalizePath, getSqlitePath } from '../lib/startup'
import { applyPendingRestore, backupBeforeMigrations } from '../services/backups'

// Type alias for the database - use Postgres type for IntelliSense
// Both SQLite and Postgres have the same runtime API
type AppDatabase = PostgresJsDatabase<typeof pgSchema>

// Determine which database to use based on DATABASE_URL
const DATABASE_URL = process.env.DATABASE_URL
const isPostgres = !!DATABASE_URL

// Detect if we're running as a compiled binary
const isCompiledBinary = (() => {
  const execName = process.execPath.split('/').pop() || ''
  return execName !== 'bun' && !execName.startsWith('bun')
})()

// Get the directory where the binary/script is located
// For compiled binaries, use dirname(process.execPath) to get the actual binary location
const APP_DIR = isCompiledBinary ? dirname(process.execPath) : import.meta.dir

// SQLite database path
const SQLITE_PATH = getSqlitePath()

// Migrations path
// Priority: MIGRATIONS_PATH env var > ./drizzle/<type> relative to binary/project
const getMigrationsPath = (dbType: 'sqlite' | 'pg') => {
  if (process.env.MIGRATIONS_PATH) {
    // Normalize to handle Windows extended-length path prefix
    return normalizePath(process.env.MIGRATIONS_PATH)
  }
  // In Docker/production with Postgres, migrations are at /usr/src/app/drizzle/pg
  if (isPostgres && existsSync('/usr/src/app/drizzle/pg')) {
    return '/usr/src/app/drizzle/pg'
  }
  // In compiled mode, use path relative to binary
  if (isCompiledBinary) {
    return join(APP_DIR, 'drizzle', dbType)
  }
  // In development, use path relative to api folder
  return join(APP_DIR, '..', '..', 'drizzle', dbType)
}

const SQLITE_MIGRATIONS_PATH = getMigrationsPath('sqlite')
const PG_MIGRATIONS_PATH = getMigrationsPath('pg')

/**
 * Database connection type
 */
export type DatabaseType = 'postgres' | 'sqlite'

/**
 * Get the current database type
 */
export function getDatabaseType(): DatabaseType {
  return isPostgres ? 'postgres' : 'sqlite'
}

/**
 * Run migrations for the database (exported for use at app startup)
 */
export async function runMigrations() {
  const migrationsPath = isPostgres ? PG_MIGRATIONS_PATH : SQLITE_MIGRATIONS_PATH

  if (!existsSync(migrationsPath)) {
    logger.warn(`[DB] Migrations folder not found at ${migrationsPath}`)
    return
  }

  // Back up SQLite before changing it, so a bad migration can be undone
  const backupPath = isPostgres ? null : backupBeforeMigrations(client as Database, migrationsPath)

  logger.debug(`[DB] Running migrations from ${migrationsPath}`)
  try {
    if (isPostgres) {
      await migratePg(db as unknown as ReturnType<typeof drizzlePg>, {
        migrationsFolder: migrationsPath,
      })
    } else {
      migrateSqlite(db as unknown as ReturnType<typeof drizzleSqlite>, {
        migrationsFolder: migrationsPath,
      })
    }
    logger.debug('[DB] Migrations completed successfully')
  } catch (error) {
    // If migrations fail due to already applied, that's OK
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage.includes('already been applied')) return

    const backupNote = backupPath ? ` Your data was backed up before the update: ${backupPath}` : ''
    throw new Error(`Database migration failed: ${errorMessage}.${backupNote}`, { cause: error })
  }
}

/**
 * Initialize the database connection
 */
function initDatabase() {
  if (isPostgres) {
    logger.debug('[DB] Connecting to PostgreSQL...')
    const client = postgres(DATABASE_URL!)
    const db = drizzlePg(client, { schema: pgSchema })
    return { db, client, type: 'postgres' as const, schema: pgSchema }
  } else {
    logger.debug(`[DB] Using SQLite at ${SQLITE_PATH}`)

    // A restore chosen in Settings is applied here, before the file is opened
    applyPendingRestore()

    // Ensure data directory exists
    const dataDir = dirname(SQLITE_PATH)
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }

    const sqlite = new Database(SQLITE_PATH)
    // Enable WAL mode for better concurrent access
    sqlite.run('PRAGMA journal_mode = WAL;')
    sqlite.run('PRAGMA foreign_keys = ON;')

    const db = drizzleSqlite(sqlite, { schema: sqliteSchema })
    return { db, client: sqlite, type: 'sqlite' as const, schema: sqliteSchema }
  }
}

// Initialize database connection
const { db: dbInstance, client, type, schema } = initDatabase()

// Export the database instance typed as Postgres for IntelliSense.
// SQLite and Postgres Drizzle instances have the same runtime API.
// Type differences (e.g., Date vs string for timestamps) are handled at call sites via dbType checks.
export const db = dbInstance as unknown as AppDatabase
export { client, schema }
export const dbType = type

// Re-export types from both schemas for convenience
export type {
  User,
  NewUser,
  Session,
  NewSession,
  Profile,
  NewProfile,
  AppConfig,
  NewAppConfig,
  Account,
  NewAccount,
  Statement,
  NewStatement,
  Transaction,
  NewTransaction,
  Budget,
  NewBudget,
  TransactionRule,
  NewTransactionRule,
  InvestmentSource,
  NewInvestmentSource,
  InvestmentHolding,
  NewInvestmentHolding,
  InvestmentTransaction,
  NewInvestmentTransaction,
  InvestmentSnapshot,
  NewInvestmentSnapshot,
  UserPreferences,
  NewUserPreferences,
  SmsMessage,
  NewSmsMessage,
  ChatConversation,
  NewChatConversation,
  ChatMessage,
  NewChatMessage,
  ChatQueryCache,
  NewChatQueryCache,
  InsurancePolicy,
  NewInsurancePolicy,
  Loan,
  NewLoan,
  PinConfig,
  NewPinConfig,
} from './schema.pg'

// Export table references typed as Postgres for IntelliSense.
// At runtime, the correct schema (SQLite or Postgres) is used based on dbType.
const tablesImpl = isPostgres
  ? {
      users: pgSchema.users,
      sessions: pgSchema.sessions,
      profiles: pgSchema.profiles,
      appConfig: pgSchema.appConfig,
      accounts: pgSchema.accounts,
      statements: pgSchema.statements,
      transactions: pgSchema.transactions,
      budgets: pgSchema.budgets,
      transactionRules: pgSchema.transactionRules,
      subscriptionOverrides: pgSchema.subscriptionOverrides,
      investmentSources: pgSchema.investmentSources,
      investmentHoldings: pgSchema.investmentHoldings,
      investmentTransactions: pgSchema.investmentTransactions,
      investmentSnapshots: pgSchema.investmentSnapshots,
      userPreferences: pgSchema.userPreferences,
      smsMessages: pgSchema.smsMessages,
      chatConversations: pgSchema.chatConversations,
      chatMessages: pgSchema.chatMessages,
      chatQueryCache: pgSchema.chatQueryCache,
      insurancePolicies: pgSchema.insurancePolicies,
      loans: pgSchema.loans,
      pinConfig: pgSchema.pinConfig,
    }
  : {
      users: sqliteSchema.users,
      sessions: sqliteSchema.sessions,
      profiles: sqliteSchema.profiles,
      appConfig: sqliteSchema.appConfig,
      accounts: sqliteSchema.accounts,
      statements: sqliteSchema.statements,
      transactions: sqliteSchema.transactions,
      budgets: sqliteSchema.budgets,
      transactionRules: sqliteSchema.transactionRules,
      subscriptionOverrides: sqliteSchema.subscriptionOverrides,
      investmentSources: sqliteSchema.investmentSources,
      investmentHoldings: sqliteSchema.investmentHoldings,
      investmentTransactions: sqliteSchema.investmentTransactions,
      investmentSnapshots: sqliteSchema.investmentSnapshots,
      userPreferences: sqliteSchema.userPreferences,
      smsMessages: sqliteSchema.smsMessages,
      chatConversations: sqliteSchema.chatConversations,
      chatMessages: sqliteSchema.chatMessages,
      chatQueryCache: sqliteSchema.chatQueryCache,
      insurancePolicies: sqliteSchema.insurancePolicies,
      loans: sqliteSchema.loans,
      pinConfig: sqliteSchema.pinConfig,
    }

export const tables = tablesImpl as {
  users: typeof pgSchema.users
  sessions: typeof pgSchema.sessions
  profiles: typeof pgSchema.profiles
  appConfig: typeof pgSchema.appConfig
  accounts: typeof pgSchema.accounts
  statements: typeof pgSchema.statements
  transactions: typeof pgSchema.transactions
  budgets: typeof pgSchema.budgets
  transactionRules: typeof pgSchema.transactionRules
  subscriptionOverrides: typeof pgSchema.subscriptionOverrides
  investmentSources: typeof pgSchema.investmentSources
  investmentHoldings: typeof pgSchema.investmentHoldings
  investmentTransactions: typeof pgSchema.investmentTransactions
  investmentSnapshots: typeof pgSchema.investmentSnapshots
  userPreferences: typeof pgSchema.userPreferences
  smsMessages: typeof pgSchema.smsMessages
  chatConversations: typeof pgSchema.chatConversations
  chatMessages: typeof pgSchema.chatMessages
  chatQueryCache: typeof pgSchema.chatQueryCache
  insurancePolicies: typeof pgSchema.insurancePolicies
  loans: typeof pgSchema.loans
  pinConfig: typeof pgSchema.pinConfig
}

/**
 * Close database connection gracefully
 */
export function closeDatabase() {
  if (isPostgres && client) {
    ;(client as ReturnType<typeof postgres>).end()
  } else if (client) {
    ;(client as Database).close()
  }
}

/**
 * Check database health
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    if (isPostgres) {
      await (client as ReturnType<typeof postgres>)`SELECT 1`
    } else {
      ;(client as Database).query('SELECT 1').get()
    }
    return true
  } catch {
    return false
  }
}
