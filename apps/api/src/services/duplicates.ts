/**
 * Duplicate transactions: finding groups of rows that look like one transaction entered twice,
 * merging a group into the copy worth keeping, and undoing a merge.
 */

import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import { db, tables, dbType } from '../db'
import type { Transaction } from '../db'
import { duplicateKey } from '../lib/duplicate-key'
import {
  compareDuplicate,
  pickKeeper,
  sourceFromHash,
  type DuplicateCandidate,
} from '../lib/duplicate-score'
import { logger } from '../lib/logger'
import { getDismissedDuplicates } from './preferences'
import {
  buildFilterConditions,
  toTransactionResponse,
  type TransactionFilters,
  type TransactionResponse,
} from './transactions'

/**
 * A set of transactions that look like the same transaction entered more than once
 */
export interface DuplicateGroup {
  key: string
  /** Group key plus its size: a new identical transaction changes it, so a dismissed group resurfaces */
  signature: string
  /** Oldest-created first */
  transactions: TransactionResponse[]
  /** 'sure' when every copy is proven the same as the suggested keeper, else 'likely' */
  tier: 'sure' | 'likely'
  /** Why the copies are thought to be the same, deduplicated across the group */
  reasons: string[]
  suggestedKeeperId: string
}

interface DuplicateRow {
  txn: TransactionResponse
  candidate: DuplicateCandidate
}

function toDuplicateRow(row: Transaction): DuplicateRow {
  const txn = toTransactionResponse(row)
  return {
    txn,
    candidate: {
      accountId: txn.accountId,
      date: txn.date,
      type: txn.type,
      amount: txn.amount,
      description: txn.originalDescription,
      statementId: txn.statementId,
      source: sourceFromHash(row.hash),
    },
  }
}

/**
 * Cluster rows (oldest-created first). A row joins the first cluster where it matches a member
 * and is not proven different from any member, so one odd row never chains two groups together.
 */
function clusterRows(rows: DuplicateRow[]): DuplicateRow[][] {
  const clusters: DuplicateRow[][] = []
  // Only rows of one account, type and amount can match, so compare within those buckets
  const buckets = new Map<string, DuplicateRow[][]>()
  for (const row of rows) {
    const { accountId, type, amount } = row.candidate
    const bucketKey = `${accountId}|${type}|${amount.toFixed(2)}`
    const inBucket = buckets.get(bucketKey) ?? []
    buckets.set(bucketKey, inBucket)
    const tiers = (cluster: DuplicateRow[]) =>
      cluster.map((member) => compareDuplicate(member.candidate, row.candidate).tier)
    const target = inBucket.find((cluster) => {
      const found = tiers(cluster)
      return !found.includes('different') && found.some((t) => t === 'sure' || t === 'likely')
    })
    if (target) {
      target.push(row)
    } else {
      const cluster = [row]
      inBucket.push(cluster)
      clusters.push(cluster)
    }
  }
  return clusters
}

/**
 * Find likely duplicate transactions: same account, type and amount, with a shared reference
 * number or a loosely matching description on the same or a nearby day. Merged copies are left out.
 * Groups the user marked as not duplicates are left out, or returned alone with `dismissed`.
 */
export async function findDuplicateGroups(
  userId: string,
  filters?: TransactionFilters,
  dismissed = false
): Promise<DuplicateGroup[]> {
  const dismissedSignatures = new Set(await getDismissedDuplicates(userId))
  const rows = await db
    .select()
    .from(tables.transactions)
    .where(
      and(...buildFilterConditions(userId, filters), isNull(tables.transactions.duplicateOfId))
    )
    .orderBy(asc(tables.transactions.createdAt), asc(tables.transactions.id))

  const groups: DuplicateGroup[] = []
  for (const cluster of clusterRows(rows.map(toDuplicateRow))) {
    if (cluster.length < 2) continue
    const first = cluster[0]!
    const key = duplicateKey({
      accountId: first.candidate.accountId,
      date: first.candidate.date,
      type: first.candidate.type,
      amount: first.candidate.amount,
      description: first.candidate.description,
    })
    const signature = `${key}#${cluster.length}`
    if (dismissedSignatures.has(signature) !== dismissed) continue

    const keeper = pickKeeper(
      cluster.map((row) => ({
        id: row.txn.id,
        createdAt: row.txn.createdAt,
        source: row.candidate.source,
      }))
    )!
    const keeperRow = cluster.find((row) => row.txn.id === keeper.id)!
    const comparisons = cluster
      .filter((row) => row !== keeperRow)
      .map((row) => compareDuplicate(keeperRow.candidate, row.candidate))
    groups.push({
      key,
      signature,
      transactions: cluster.map((row) => row.txn),
      tier: comparisons.every((c) => c.tier === 'sure') ? 'sure' : 'likely',
      reasons: [...new Set(comparisons.flatMap((c) => c.reasons))],
      suggestedKeeperId: keeper.id,
    })
  }
  return groups.sort((a, b) => b.transactions[0]!.date.localeCompare(a.transactions[0]!.date))
}

// ============================================================================
// REVIEW COUNT CACHE
// ============================================================================

/** The sidebar badge asks for the count on every request; finding groups scans all transactions */
const CACHE_TTL_MS = 60_000

const groupCountCache = new Map<string, Map<string, { count: number; expiresAt: number }>>()

/** Forget the cached group counts of a user; call after anything that changes their transactions */
export function invalidateDuplicateCache(userId: string): void {
  groupCountCache.delete(userId)
}

/** Number of duplicate groups waiting for review, cached per user and profile for a minute */
export async function countDuplicateGroups(userId: string, profileId?: string): Promise<number> {
  const profileKey = profileId ?? ''
  const cached = groupCountCache.get(userId)?.get(profileKey)
  if (cached && cached.expiresAt > Date.now()) return cached.count

  const count = (await findDuplicateGroups(userId, { profileId })).length
  const forUser = groupCountCache.get(userId) ?? new Map()
  forUser.set(profileKey, { count, expiresAt: Date.now() + CACHE_TTL_MS })
  groupCountCache.set(userId, forUser)
  return count
}

// ============================================================================
// MERGE AND UNMERGE
// ============================================================================

/** The columns a merge can change on a row, as they were before it, so a merge can be undone */
export interface DuplicateRowSnapshot {
  id: string
  category: string
  categorySource: string | null
  isManuallyCategorized: boolean
  categoryConfidence: Transaction['categoryConfidence']
  summary: string | null
  nameSource: string | null
  notes: string | null
  smsVerified: boolean
  linkedEntityId: string | null
  linkedEntityType: string | null
  isHidden: boolean
  duplicateOfId: string | null
}

export interface DuplicateMergeResult {
  keeperId: string
  mergedIds: string[]
  /** The keeper and every merged copy as they were before the merge */
  before: DuplicateRowSnapshot[]
}

function snapshotOf(row: Transaction): DuplicateRowSnapshot {
  return {
    id: row.id,
    category: row.category,
    categorySource: row.categorySource ?? null,
    isManuallyCategorized: row.isManuallyCategorized ?? false,
    categoryConfidence: row.categoryConfidence,
    summary: row.summary,
    nameSource: row.nameSource ?? null,
    notes: row.notes ?? null,
    smsVerified: row.smsVerified ?? false,
    linkedEntityId: row.linkedEntityId,
    linkedEntityType: row.linkedEntityType,
    isHidden: row.isHidden ?? false,
    duplicateOfId: row.duplicateOfId ?? null,
  }
}

/**
 * Merge copies into the transaction to keep: whatever the user set by hand on a copy (category,
 * name, notes) is carried onto the keeper unless the keeper already has its own, then the copies
 * are hidden and point at the keeper. Nothing is deleted.
 * Returns null when the keeper or a copy is not found for this user.
 */
export async function mergeDuplicates(
  userId: string,
  keeperId: string,
  ids: string[]
): Promise<DuplicateMergeResult | null> {
  const copyIds = [...new Set(ids)].filter((id) => id !== keeperId)
  if (copyIds.length === 0) return null

  const result = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(tables.transactions)
      .where(
        and(
          eq(tables.transactions.userId, userId),
          inArray(tables.transactions.id, [keeperId, ...copyIds])
        )
      )
    const keeper = rows.find((row) => row.id === keeperId)
    const copies = copyIds.map((id) => rows.find((row) => row.id === id))
    if (!keeper || copies.some((copy) => !copy)) return null
    const found = copies as Transaction[]

    const now = (dbType === 'postgres' ? new Date() : new Date().toISOString()) as Date
    const carried: Partial<Transaction> = {}

    // A category or name the user chose beats one a rule, the memory or the AI picked
    const userCategory = found.find((copy) => copy.categorySource === 'user')
    if (userCategory && keeper.categorySource !== 'user') {
      carried.category = userCategory.category
      carried.categorySource = 'user'
      carried.isManuallyCategorized = userCategory.isManuallyCategorized
      carried.categoryConfidence = userCategory.categoryConfidence
    }
    const userName = found.find((copy) => copy.nameSource === 'user')
    if (userName && keeper.nameSource !== 'user') {
      carried.summary = userName.summary
      carried.nameSource = 'user'
    }
    if (!keeper.notes) {
      const withNotes = found.find((copy) => copy.notes)
      if (withNotes) carried.notes = withNotes.notes
    }
    if (!keeper.smsVerified && found.some((copy) => copy.smsVerified)) carried.smsVerified = true

    // Links move to the keeper when it has none; a transaction pointing back at the copy follows
    const linked = !keeper.linkedEntityId ? found.find((copy) => copy.linkedEntityId) : undefined
    if (linked) {
      carried.linkedEntityId = linked.linkedEntityId
      carried.linkedEntityType = linked.linkedEntityType
      await tx
        .update(tables.transactions)
        .set({ linkedEntityId: keeperId, updatedAt: now })
        .where(
          and(
            eq(tables.transactions.userId, userId),
            eq(tables.transactions.linkedEntityType, 'transaction'),
            eq(tables.transactions.linkedEntityId, linked.id)
          )
        )
      await tx
        .update(tables.transactions)
        .set({ linkedEntityId: null, linkedEntityType: null, updatedAt: now })
        .where(eq(tables.transactions.id, linked.id))
    }

    if (Object.keys(carried).length > 0) {
      await tx
        .update(tables.transactions)
        .set({ ...carried, updatedAt: now })
        .where(eq(tables.transactions.id, keeperId))
    }
    await tx
      .update(tables.transactions)
      .set({ isHidden: true, duplicateOfId: keeperId, updatedAt: now })
      .where(and(eq(tables.transactions.userId, userId), inArray(tables.transactions.id, copyIds)))

    return {
      keeperId,
      mergedIds: copyIds,
      before: [keeper, ...found].map(snapshotOf),
    }
  })

  if (result) {
    invalidateDuplicateCache(userId)
    logger.debug(`[Duplicates] Merged ${result.mergedIds.length} copies into ${keeperId}`)
  }
  return result
}

/** Bring a merged copy back as its own transaction. Returns false when it is not a merged copy. */
export async function unmergeDuplicate(userId: string, id: string): Promise<boolean> {
  const now = (dbType === 'postgres' ? new Date() : new Date().toISOString()) as Date
  const updated = await db
    .update(tables.transactions)
    .set({ isHidden: false, duplicateOfId: null, updatedAt: now })
    .where(
      and(
        eq(tables.transactions.id, id),
        eq(tables.transactions.userId, userId),
        isNotNull(tables.transactions.duplicateOfId)
      )
    )
    .returning({ id: tables.transactions.id })
  if (updated.length === 0) return false
  invalidateDuplicateCache(userId)
  return true
}

export interface MergedDuplicate {
  transaction: TransactionResponse
  /** The transaction it was merged into; null if that one has since been deleted */
  keeper: {
    id: string
    summary: string | null
    originalDescription: string
    date: string
    amount: number
  } | null
}

/** Merged copies with the transaction each was merged into, newest transactions first */
export async function listMerged(userId: string, profileId?: string): Promise<MergedDuplicate[]> {
  const copies = await db
    .select()
    .from(tables.transactions)
    .where(
      and(
        eq(tables.transactions.userId, userId),
        isNotNull(tables.transactions.duplicateOfId),
        ...(profileId ? [eq(tables.transactions.profileId, profileId)] : [])
      )
    )
    .orderBy(asc(tables.transactions.date))
  if (copies.length === 0) return []

  const keeperIds = [...new Set(copies.map((copy) => copy.duplicateOfId!))]
  const keepers = new Map<string, MergedDuplicate['keeper']>()
  // Chunked: a long merge history would overflow SQLite's variable limit in one IN list
  for (let i = 0; i < keeperIds.length; i += 500) {
    const rows = await db
      .select()
      .from(tables.transactions)
      .where(
        and(
          eq(tables.transactions.userId, userId),
          inArray(tables.transactions.id, keeperIds.slice(i, i + 500))
        )
      )
    for (const row of rows) {
      const keeper = toTransactionResponse(row)
      keepers.set(row.id, {
        id: keeper.id,
        summary: keeper.summary,
        originalDescription: keeper.originalDescription,
        date: keeper.date,
        amount: keeper.amount,
      })
    }
  }

  return copies
    .map((copy) => ({
      transaction: toTransactionResponse(copy),
      keeper: keepers.get(copy.duplicateOfId!) ?? null,
    }))
    .reverse()
}
