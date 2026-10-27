/**
 * Import of card / bank transaction alerts from the macOS Messages app.
 *
 * Messages are read from the local Messages database, parsed with rules (and optionally an LLM),
 * matched to an account by the last 4 digits and inserted as transactions. A message that cannot
 * be finished automatically waits in a review list so the user can complete or dismiss it.
 */

import { and, eq, desc, gte, inArray, like, or } from 'drizzle-orm'
import { db, tables, dbType } from '../db'
import type { Account } from '../db'
import { decrypt, decryptOptional, encrypt } from '../lib/encryption'
import { getLast4 } from '../lib/account-number'
import { isAuthEnabled } from '../lib/startup'
import { logger } from '../lib/logger'
import {
  checkMessagesAccess,
  getLatestRowId,
  readMessagesAfter,
  type IncomingMessage,
  MESSAGE_BATCH_SIZE,
  type MessagesAccess,
} from '../lib/sms/messages-db'
import { pickTransactionDate } from '../lib/sms/date'
import { looksLikeTransaction, parseSms, toCompleteSms, type ParsedSms } from '../lib/sms/parse'
import { senderTrust, type SenderCounts } from '../lib/sms/sender'
import { parseSmsWithLLM } from '../llm/sms-parser'
import { getLLMSettings } from './config'
import { findUserById } from './user'
import { linkEntitiesForAccount } from './entity-linking'
import type { CountryCode } from '../lib/constants'
import {
  createSmsTransaction,
  toTransactionResponse,
  type TransactionResponse,
} from './transactions'
import { reconcileSmsTransactions } from './sms-matching'
import { getRulesForUser } from './transaction-rules'
import { resolveRuleFields } from '../lib/transaction-rules'
import { getPreference, setPreference, PREFERENCE_KEYS } from './preferences'

const MIN_INSTITUTION_WORD = 3

export interface SmsImportStatus {
  /** Reading Messages only works in the macOS desktop / local app */
  supported: boolean
  enabled: boolean
  aiParsing: boolean
  /** Skip messages that match no added account instead of queueing them for review */
  ignoreUnknownAccounts: boolean
  /** Whether an LLM provider is set up, needed for AI parsing */
  aiAvailable: boolean
  access: MessagesAccess | null
  lastSyncAt: string | null
  pendingCount: number
}

export interface PendingSms {
  id: string
  sender: string
  receivedAt: string
  body: string
  amount: number | null
  currency: string | null
  type: 'credit' | 'debit' | null
  merchant: string | null
  last4: string | null
  accountId: string | null
  /** The date stated in the message, when it has one */
  date: string | null
}

export interface SyncedSms {
  id: string
  sender: string
  receivedAt: string
  status: 'imported' | 'needs_review' | 'dismissed' | 'verified'
  amount: number | null
  currency: string | null
  type: 'credit' | 'debit' | null
  merchant: string | null
  last4: string | null
  accountId: string | null
  transactionId: string | null
  /** The transaction the message created or verified, for showing and editing it in place */
  transaction: TransactionResponse | null
  /** When the message became a transaction (read, or added from review) */
  importedAt: string
}

export interface SmsImportInput {
  accountId: string
  date: string
  amount: number
  currency: string
  type: 'credit' | 'debit'
  merchant: string
}

export interface SyncResult {
  imported: number
  needsReview: number
  /** Transactions matched with a statement line, in either direction */
  verified: number
}

export interface ClearResult {
  transactions: number
  messages: number
}

const FULL_DISK_ACCESS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'

/** Open the Full Disk Access pane of System Settings (the web view cannot open this link itself) */
export function openFullDiskAccessSettings(): void {
  Bun.spawn(['open', FULL_DISK_ACCESS_URL])
}

export function isSmsImportSupported(): boolean {
  return process.platform === 'darwin' && !isAuthEnabled()
}

let lastSyncAt: string | null = null
let syncInFlight: Promise<SyncResult> | null = null

function nowValue(): Date {
  return (dbType === 'postgres' ? new Date() : new Date().toISOString()) as Date
}

function normalizeWord(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '')
}

async function readFlag(
  userId: string,
  key: 'sms_import.enabled' | 'sms_import.ai_parsing' | 'sms_import.ignore_unknown_accounts'
) {
  return (await getPreference(userId, key)) === 'true'
}

export async function getSmsImportStatus(userId: string): Promise<SmsImportStatus> {
  const supported = isSmsImportSupported()
  const [enabled, aiParsing, ignoreUnknownAccounts, llm, pending] = await Promise.all([
    readFlag(userId, PREFERENCE_KEYS.SMS_IMPORT_ENABLED),
    readFlag(userId, PREFERENCE_KEYS.SMS_IMPORT_AI_PARSING),
    readFlag(userId, PREFERENCE_KEYS.SMS_IMPORT_IGNORE_UNKNOWN),
    getLLMSettings(),
    countPending(userId),
  ])

  return {
    supported,
    enabled: supported && enabled,
    aiParsing,
    ignoreUnknownAccounts,
    aiAvailable: llm.isConfigured,
    access: supported ? checkMessagesAccess() : null,
    lastSyncAt,
    pendingCount: pending,
  }
}

/**
 * Switch reading on/off or AI parsing on/off. Switching reading on starts from the newest message
 * so the user's message history is not imported, only alerts that arrive from now on.
 */
export async function updateSmsImportSettings(
  userId: string,
  patch: { enabled?: boolean; aiParsing?: boolean; ignoreUnknownAccounts?: boolean }
): Promise<void> {
  if (patch.aiParsing !== undefined) {
    await setPreference(userId, PREFERENCE_KEYS.SMS_IMPORT_AI_PARSING, String(patch.aiParsing))
  }
  if (patch.ignoreUnknownAccounts !== undefined) {
    await setPreference(
      userId,
      PREFERENCE_KEYS.SMS_IMPORT_IGNORE_UNKNOWN,
      String(patch.ignoreUnknownAccounts)
    )
  }
  if (patch.enabled !== undefined) {
    if (patch.enabled) {
      if (checkMessagesAccess() === 'ok') {
        const cursor = await getPreference(userId, PREFERENCE_KEYS.SMS_IMPORT_CURSOR)
        if (cursor === null) {
          await setPreference(userId, PREFERENCE_KEYS.SMS_IMPORT_CURSOR, String(getLatestRowId()))
        }
      }
    }
    await setPreference(userId, PREFERENCE_KEYS.SMS_IMPORT_ENABLED, String(patch.enabled))
  }
}

/**
 * Find the account a message belongs to by the last 4 digits. When several accounts end in the
 * same digits, the one whose institution is named in the message or sender wins; if that is still
 * not a single account the message is left for the user to assign.
 */
async function matchAccount(
  userId: string,
  last4: string,
  haystack: string
): Promise<Account | null> {
  const accounts = await db
    .select()
    .from(tables.accounts)
    .where(and(eq(tables.accounts.userId, userId), eq(tables.accounts.isActive, true)))

  const candidates = accounts.filter(
    (account) => getLast4(decryptOptional(account.accountNumber)) === last4
  )
  if (candidates.length <= 1) return candidates[0] ?? null

  const text = normalizeWord(haystack)
  const named = candidates.filter((account) => {
    const words = (account.institution ?? '')
      .split(/\s+/)
      .map(normalizeWord)
      .filter((word) => word.length >= MIN_INSTITUTION_WORD)
    return words.some((word) => text.includes(word))
  })
  return named.length === 1 ? named[0]! : null
}

/** Name and category for a merchant from the user's transaction rules */
async function resolveNaming(
  userId: string,
  merchant: string,
  type: 'credit' | 'debit',
  amount: number
): Promise<{ summary: string; category: string; ruleMatched: boolean }> {
  const rules = await getRulesForUser(userId)
  const fields = resolveRuleFields(rules, { description: merchant, type, amount })
  return {
    summary: fields.name ?? merchant,
    category: fields.category ?? 'other',
    ruleMatched: fields.category !== undefined,
  }
}

/** A transaction just created from a message, waiting to be categorized */
interface ImportedRef {
  transactionId: string
  accountId: string
  profileId: string
  statementId: string
}

/**
 * Create the transaction. With AI on it is left uncategorized (the categorizer applies the user's
 * rules and then the AI afterwards, exactly like a statement import); with AI off it is named and
 * categorized from the user's rules only.
 */
async function importTransaction(
  userId: string,
  guid: string,
  input: SmsImportInput,
  useAi: boolean
): Promise<ImportedRef> {
  const naming = useAi
    ? { summary: null, category: 'other', ruleMatched: false }
    : await resolveNaming(userId, input.merchant, input.type, input.amount)
  const created = await createSmsTransaction(userId, {
    accountId: input.accountId,
    guid,
    date: input.date,
    amount: input.amount,
    currency: input.currency,
    type: input.type,
    merchant: input.merchant,
    ...naming,
  })
  return {
    transactionId: created.id,
    accountId: created.accountId,
    profileId: created.profileId,
    statementId: created.statementId,
  }
}

/** Whether new transactions should go through AI categorization: switched on and a provider set up */
async function aiCategorizationAvailable(userId: string): Promise<boolean> {
  if (!(await readFlag(userId, PREFERENCE_KEYS.SMS_IMPORT_AI_PARSING))) return false
  return (await getLLMSettings()).isConfigured
}

/**
 * Categorize newly imported transactions the same way statements are: the user's rules, then the
 * AI with the account type, profile summary and categorization hints for context, then entity
 * linking (loans, insurance). Failures are logged; the rows stay uncategorized and are picked up
 * again on the next start.
 */
async function categorizeImported(userId: string, refs: ImportedRef[]): Promise<void> {
  if (refs.length === 0) return

  const user = await findUserById(userId)
  if (!user?.country) return

  const { categorizeStatements } = await import('../lib/pdf')
  const byAccount = new Map<string, ImportedRef>()
  for (const ref of refs) byAccount.set(ref.accountId, ref)

  for (const ref of byAccount.values()) {
    try {
      const provider = await getPreference(
        userId,
        PREFERENCE_KEYS.STATEMENT_CATEGORISATION_PROVIDER,
        ref.profileId
      )
      const model = await getPreference(
        userId,
        PREFERENCE_KEYS.STATEMENT_CATEGORISATION_MODEL,
        ref.profileId
      )
      const categorizationModel = provider && model ? `${provider}:${model}` : undefined

      // Account hints are applied by the categorizer itself; the default hints fill in otherwise
      const [account] = await db
        .select({ hints: tables.accounts.categorizationHints })
        .from(tables.accounts)
        .where(eq(tables.accounts.id, ref.accountId))
        .limit(1)
      const defaultHints = account?.hints?.trim()
        ? undefined
        : (
            await getPreference(userId, PREFERENCE_KEYS.DEFAULT_CATEGORIZATION_HINTS, ref.profileId)
          )?.trim() || undefined

      await categorizeStatements(
        [ref.statementId],
        user.country as CountryCode,
        categorizationModel,
        undefined,
        ref.profileId,
        defaultHints
      )
      await linkEntitiesForAccount(ref.accountId, userId, categorizationModel)
    } catch (error) {
      logger.error(`[SmsImport] Categorization failed for account ${ref.accountId}:`, error)
    }
  }
}

interface ReviewFields {
  parsed: ParsedSms
  accountId: string | null
}

function reviewValues(parsed: ParsedSms) {
  return {
    amount: parsed.amount !== null ? String(parsed.amount) : null,
    currency: parsed.currency,
    type: parsed.type,
    merchant: parsed.merchant,
    last4: parsed.last4,
    transactionDate: parsed.date,
  }
}

async function queueForReview(
  userId: string,
  message: IncomingMessage,
  { parsed, accountId }: ReviewFields
): Promise<void> {
  const now = nowValue()
  await db.insert(tables.smsMessages).values({
    userId,
    guid: message.guid,
    sender: message.sender,
    receivedAt: (dbType === 'postgres' ? new Date(message.receivedAt) : message.receivedAt) as Date,
    status: 'needs_review',
    body: encrypt(message.body),
    accountId,
    ...reviewValues(parsed),
    createdAt: now,
    updatedAt: now,
  })
}

async function recordImported(
  userId: string,
  message: IncomingMessage,
  parsed: ParsedSms,
  accountId: string,
  transactionId: string
): Promise<void> {
  const now = nowValue()
  await db.insert(tables.smsMessages).values({
    userId,
    guid: message.guid,
    sender: message.sender,
    receivedAt: (dbType === 'postgres' ? new Date(message.receivedAt) : message.receivedAt) as Date,
    status: 'imported',
    accountId,
    transactionId,
    ...reviewValues(parsed),
    createdAt: now,
    updatedAt: now,
  })
}

async function alreadySeen(userId: string, guid: string): Promise<boolean> {
  const [row] = await db
    .select({ id: tables.smsMessages.id })
    .from(tables.smsMessages)
    .where(and(eq(tables.smsMessages.userId, userId), eq(tables.smsMessages.guid, guid)))
    .limit(1)
  return !!row
}

/**
 * Rule-based parse first; when the rules could not read everything and the user allows it, the AI
 * reads the message too (always, for a sender that looks like a vendor, so the review form is
 * filled in). The AI's direction and merchant replace the rules' (it reads the wording the rules
 * only pattern-match), while the rules' amount, card digits and date are kept when found.
 */
async function parseMessage(
  body: string,
  aiParsing: boolean,
  alwaysUseAi: boolean
): Promise<ParsedSms | null> {
  const parsed = parseSms(body)
  if (!aiParsing || (!alwaysUseAi && toCompleteSms(parsed))) return parsed

  try {
    const ai = await parseSmsWithLLM(body)
    if (!ai) return null
    return {
      date: parsed.date,
      amount: parsed.amount ?? ai.amount,
      currency: parsed.currency ?? ai.currency,
      type: ai.type ?? parsed.type,
      last4: parsed.last4 ?? ai.last4,
      merchant: ai.merchant ?? parsed.merchant,
    }
  } catch (error) {
    logger.warn('[SmsImport] AI parsing failed, leaving the message for review:', error)
    return parsed
  }
}

/** Senders of verified and of dismissed messages, with how many each sent */
interface SenderHistory {
  verified: SenderCounts
  dismissed: SenderCounts
}

async function loadSenderHistory(userId: string): Promise<SenderHistory> {
  const rows = await db
    .select({ sender: tables.smsMessages.sender, status: tables.smsMessages.status })
    .from(tables.smsMessages)
    .where(
      and(
        eq(tables.smsMessages.userId, userId),
        inArray(tables.smsMessages.status, ['verified', 'dismissed'])
      )
    )

  const history: SenderHistory = { verified: new Map(), dismissed: new Map() }
  for (const { sender, status } of rows) {
    const counts = status === 'verified' ? history.verified : history.dismissed
    counts.set(sender, (counts.get(sender) ?? 0) + 1)
  }
  return history
}

interface MessageResult {
  outcome: 'ignored' | 'imported' | 'needs_review'
  imported?: ImportedRef
}

async function processMessage(
  userId: string,
  message: IncomingMessage,
  aiParsing: boolean,
  useAi: boolean,
  ignoreUnknownAccounts: boolean,
  senders: SenderHistory
): Promise<MessageResult> {
  if (!looksLikeTransaction(message.body)) return { outcome: 'ignored' }
  if (await alreadySeen(userId, message.guid)) return { outcome: 'ignored' }

  // A sender unlike every bank seen so far (a vendor confirming a charge) is never imported
  // unattended: its message waits in review, read by the AI so the form is filled in
  const fromVendor = senderTrust(message.sender, senders.verified, senders.dismissed) === 'vendor'
  const parsed = await parseMessage(message.body, aiParsing, fromVendor)
  if (!parsed) return { outcome: 'ignored' }

  const complete = toCompleteSms(parsed)
  const account = parsed.last4
    ? await matchAccount(userId, parsed.last4, `${message.sender} ${message.body}`)
    : null

  if (!account && ignoreUnknownAccounts) return { outcome: 'ignored' }

  // A charge in another currency cannot be matched with the statement (which lists it converted)
  // and must not be added up with the account's own currency, so it waits for the user
  const foreignCurrency = !!complete && !!account && account.currency !== complete.currency

  if (!complete || !account || foreignCurrency || fromVendor) {
    await queueForReview(userId, message, { parsed, accountId: account?.id ?? null })
    return { outcome: 'needs_review' }
  }

  const created = await importTransaction(
    userId,
    message.guid,
    {
      accountId: account.id,
      date: pickTransactionDate(parsed.date, message.receivedAt),
      amount: complete.amount,
      currency: complete.currency,
      type: complete.type,
      merchant: complete.merchant,
    },
    useAi
  )
  await recordImported(userId, message, parsed, account.id, created.transactionId)
  return { outcome: 'imported', imported: created }
}

async function runSync(userId: string, since?: Date): Promise<SyncResult> {
  const result: SyncResult = { imported: 0, needsReview: 0, verified: 0 }
  if (checkMessagesAccess() !== 'ok') return result

  const aiParsing = await readFlag(userId, PREFERENCE_KEYS.SMS_IMPORT_AI_PARSING)
  const useAi = await aiCategorizationAvailable(userId)
  const ignoreUnknownAccounts = await readFlag(userId, PREFERENCE_KEYS.SMS_IMPORT_IGNORE_UNKNOWN)
  const senders = await loadSenderHistory(userId)
  const importedRefs: ImportedRef[] = []
  const storedCursor = await getPreference(userId, PREFERENCE_KEYS.SMS_IMPORT_CURSOR)
  // Never start from the beginning of the message history unless a date asks for it
  const savedCursor = storedCursor === null ? getLatestRowId() : Number(storedCursor)
  let cursor = since ? 0 : savedCursor

  for (;;) {
    const messages = readMessagesAfter(cursor, since)
    for (const message of messages) {
      try {
        const { outcome, imported } = await processMessage(
          userId,
          message,
          aiParsing,
          useAi,
          ignoreUnknownAccounts,
          senders
        )
        if (outcome === 'imported') result.imported++
        if (outcome === 'needs_review') result.needsReview++
        if (imported) importedRefs.push(imported)
      } catch (error) {
        logger.error('[SmsImport] Failed to process a message:', error)
      }
      cursor = message.rowId
    }
    if (messages.length < MESSAGE_BATCH_SIZE) break
  }

  await setPreference(
    userId,
    PREFERENCE_KEYS.SMS_IMPORT_CURSOR,
    String(Math.max(cursor, savedCursor))
  )

  // Match the new transactions with statement lines already imported, before categorizing
  const accountIds = [...new Set(importedRefs.map((ref) => ref.accountId))]
  result.verified = await reconcileSmsTransactions(userId, accountIds)
  result.imported -= result.verified

  if (useAi) await categorizeImported(userId, importedRefs)

  lastSyncAt = new Date().toISOString()
  if (result.imported + result.needsReview + result.verified > 0) {
    logger.info(
      `[SmsImport] ${result.imported} imported, ${result.verified} verified, ${result.needsReview} waiting for review`
    )
  }
  return result
}

/**
 * Read messages now. Without `since`, only messages after the last one read; with it, every
 * message received at or after that time (messages already read are skipped). Overlapping
 * calls share one run.
 */
export function syncSmsMessages(userId: string, since?: Date): Promise<SyncResult> {
  if (!isSmsImportSupported()) return Promise.resolve({ imported: 0, needsReview: 0, verified: 0 })
  syncInFlight ??= runSync(userId, since).finally(() => {
    syncInFlight = null
  })
  return syncInFlight
}

let unlockSync: Promise<SyncResult | null> | null = null
let unlockSyncReported = false

/**
 * Read new messages once per app run, as soon as the app is unlocked, if reading is switched on.
 * The result is handed to the web app by takeUnlockSyncResult, which shows it as a toast.
 */
export function syncSmsOnUnlock(userId: string): void {
  if (unlockSync || !isSmsImportSupported()) return
  unlockSync = readFlag(userId, PREFERENCE_KEYS.SMS_IMPORT_ENABLED)
    .then((enabled) => (enabled ? syncSmsMessages(userId) : null))
    .catch((error) => {
      logger.error('[SmsImport] Startup sync failed:', error)
      return null
    })
}

/** What the unlock sync found, waiting for it to finish. Returns it only once per app run. */
export async function takeUnlockSyncResult(): Promise<SyncResult | null> {
  if (!unlockSync || unlockSyncReported) return null
  unlockSyncReported = true
  return unlockSync
}

async function countPending(userId: string): Promise<number> {
  const rows = await db
    .select({ id: tables.smsMessages.id })
    .from(tables.smsMessages)
    .where(
      and(eq(tables.smsMessages.userId, userId), eq(tables.smsMessages.status, 'needs_review'))
    )
  return rows.length
}

export async function listPendingSms(userId: string): Promise<PendingSms[]> {
  const rows = await db
    .select()
    .from(tables.smsMessages)
    .where(
      and(eq(tables.smsMessages.userId, userId), eq(tables.smsMessages.status, 'needs_review'))
    )
    .orderBy(desc(tables.smsMessages.receivedAt))

  return rows.map((row) => ({
    id: row.id,
    sender: row.sender,
    receivedAt: new Date(row.receivedAt).toISOString(),
    body: row.body ? decrypt(row.body) : '',
    amount: row.amount !== null ? Number(row.amount) : null,
    currency: row.currency,
    type: row.type === 'credit' || row.type === 'debit' ? row.type : null,
    merchant: row.merchant,
    last4: row.last4,
    accountId: row.accountId,
    date: row.transactionDate,
  }))
}

const MAX_LISTED_MESSAGES = 500
/** Messages that are done (imported, verified, dismissed) stay listed this long; keep in step with the page text */
const LISTED_DAYS = 14

/**
 * The messages to list, newest first: every one waiting for review, and the others for the last
 * LISTED_DAYS days counted from when they became a transaction (or were dismissed), not from when
 * the message arrived. Older ones are in the transactions list.
 */
export async function listSyncedSms(userId: string): Promise<SyncedSms[]> {
  const since = new Date(Date.now() - LISTED_DAYS * 24 * 60 * 60 * 1000)
  const sinceValue = (dbType === 'postgres' ? since : since.toISOString()) as Date
  const rows = await db
    .select()
    .from(tables.smsMessages)
    .where(
      and(
        eq(tables.smsMessages.userId, userId),
        or(
          eq(tables.smsMessages.status, 'needs_review'),
          and(
            inArray(tables.smsMessages.status, ['imported', 'dismissed']),
            gte(tables.smsMessages.updatedAt, sinceValue)
          ),
          and(
            eq(tables.smsMessages.status, 'verified'),
            gte(tables.smsMessages.createdAt, sinceValue)
          )
        )
      )
    )
    .orderBy(desc(tables.smsMessages.receivedAt))
    .limit(MAX_LISTED_MESSAGES)

  const transactionIds = rows.flatMap((row) => (row.transactionId ? [row.transactionId] : []))
  const transactions =
    transactionIds.length === 0
      ? []
      : await db
          .select()
          .from(tables.transactions)
          .where(
            and(
              eq(tables.transactions.userId, userId),
              inArray(tables.transactions.id, transactionIds)
            )
          )
  const transactionById = new Map(transactions.map((txn) => [txn.id, toTransactionResponse(txn)]))

  // Imported or verified messages whose transaction is gone (deleted along with its statement or
  // account) have nothing to show
  const listed = rows.filter(
    (row) => row.transactionId !== null || (row.status !== 'imported' && row.status !== 'verified')
  )

  return listed.map((row) => ({
    id: row.id,
    sender: row.sender,
    receivedAt: new Date(row.receivedAt).toISOString(),
    status: row.status as SyncedSms['status'],
    amount: row.amount !== null ? Number(row.amount) : null,
    currency: row.currency,
    type: row.type === 'credit' || row.type === 'debit' ? row.type : null,
    merchant: row.merchant,
    last4: row.last4,
    accountId: row.accountId,
    transactionId: row.transactionId,
    transaction: row.transactionId ? (transactionById.get(row.transactionId) ?? null) : null,
    // A message added from review becomes a transaction when it is added, any other when it is read
    importedAt: new Date(row.status === 'imported' ? row.updatedAt : row.createdAt).toISOString(),
  }))
}

/**
 * Remove everything imported from messages: the transactions they created and the message records.
 * Messages can be synced again afterwards.
 */
export async function clearSyncedSms(userId: string): Promise<ClearResult> {
  const transactions = await db
    .delete(tables.transactions)
    .where(and(eq(tables.transactions.userId, userId), like(tables.transactions.hash, 'sms:%')))
    .returning({ id: tables.transactions.id })
  // Statement lines verified by a message lose their mark with the message record
  const verified = await db
    .select({ transactionId: tables.smsMessages.transactionId })
    .from(tables.smsMessages)
    .where(and(eq(tables.smsMessages.userId, userId), eq(tables.smsMessages.status, 'verified')))
  const verifiedIds = verified.flatMap((row) => (row.transactionId ? [row.transactionId] : []))
  if (verifiedIds.length > 0) {
    await db
      .update(tables.transactions)
      .set({ smsVerified: false })
      .where(inArray(tables.transactions.id, verifiedIds))
  }
  const messages = await db
    .delete(tables.smsMessages)
    .where(eq(tables.smsMessages.userId, userId))
    .returning({ id: tables.smsMessages.id })
  return { transactions: transactions.length, messages: messages.length }
}

async function getPendingRow(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(tables.smsMessages)
    .where(
      and(
        eq(tables.smsMessages.id, id),
        eq(tables.smsMessages.userId, userId),
        eq(tables.smsMessages.status, 'needs_review')
      )
    )
    .limit(1)
  return row ?? null
}

/** Finish a waiting message with the details the user confirmed. Returns false if it is not waiting. */
export async function importPendingSms(
  userId: string,
  id: string,
  input: SmsImportInput
): Promise<boolean> {
  const row = await getPendingRow(userId, id)
  if (!row) return false

  const useAi = await aiCategorizationAvailable(userId)
  const created = await importTransaction(userId, row.guid, input, useAi)
  await db
    .update(tables.smsMessages)
    .set({
      status: 'imported',
      body: null,
      accountId: input.accountId,
      transactionId: created.transactionId,
      updatedAt: nowValue(),
    })
    .where(eq(tables.smsMessages.id, row.id))

  // Match it with a statement line that may already be imported, then categorize in the background
  // so the review form closes right away
  await reconcileSmsTransactions(userId, [input.accountId])
  if (useAi) void categorizeImported(userId, [created])
  return true
}

/**
 * Drop a waiting message without importing it. The text is kept so the dismissal can be undone.
 * Returns false if it is not waiting.
 */
export async function dismissPendingSms(userId: string, id: string): Promise<boolean> {
  const row = await getPendingRow(userId, id)
  if (!row) return false

  await db
    .update(tables.smsMessages)
    .set({ status: 'dismissed', updatedAt: nowValue() })
    .where(eq(tables.smsMessages.id, row.id))
  return true
}

/** Put a dismissed message back in the review list. Returns false if it is not dismissed. */
export async function restoreDismissedSms(userId: string, id: string): Promise<boolean> {
  const restored = await db
    .update(tables.smsMessages)
    .set({ status: 'needs_review', updatedAt: nowValue() })
    .where(
      and(
        eq(tables.smsMessages.id, id),
        eq(tables.smsMessages.userId, userId),
        eq(tables.smsMessages.status, 'dismissed')
      )
    )
    .returning({ id: tables.smsMessages.id })
  return restored.length > 0
}
