/**
 * Categorization memory: what the user (and their rules) already decided for each merchant,
 * so a merchant that was settled once is answered without asking the AI again.
 * Pure functions, no I/O.
 */

import type { LabelSource } from './constants'

/** One past transaction, as read for building the memory */
export interface MemoryRow {
  fingerprint: string
  type: string
  category: string
  name: string | null
  isSubscription: boolean
  categorySource: LabelSource | null
  nameSource: LabelSource | null
  confidence: number | null
  date: string
  updatedAt: string | Date
  description: string
}

/** Everything known about one merchant + direction */
export interface MemoryEntry {
  fingerprint: string
  type: string
  /** Weight of every category, by the sources that chose it */
  votes: Map<string, number>
  /** How many past transactions chose each category (only transactions that carry weight) */
  rowCounts: Map<string, number>
  totalWeight: number
  /** Number of transactions whose category was set by the user */
  userVotes: number
  /** Strongest source among the voting transactions */
  strongestSource: 'user' | 'rule' | 'ai' | null
  name: string | null
  isSubscription: boolean
  /** Description of the most recently updated transaction */
  sampleDescription: string
}

export interface ResolvedFromMemory {
  category: string
  name: string
  isSubscription: boolean
  confidence: number
}

const USER_WEIGHT = 3
const RULE_WEIGHT = 2
const AI_WEIGHT = 1
/** An AI answer only counts when it was this sure ... */
const AI_MIN_CONFIDENCE = 0.85
/** ... and has stood for this many days without the user correcting it */
const AI_MIN_AGE_DAYS = 14

/** Share of the weight the top category needs to answer without the AI */
const RESOLVE_MIN_SHARE = 0.9
const RESOLVE_MIN_WEIGHT = 3
/** Share at which a memory entry is trusted enough to check the AI's answer against */
const SANITY_MIN_SHARE = 0.6
const DISAGREE_MAX_CONFIDENCE = 0.6
const AGREE_MIN_CONFIDENCE = 0.85

const DAY_MS = 24 * 60 * 60 * 1000

interface Accumulator extends MemoryEntry {
  latestUpdate: number
  latestUserNameUpdate: number
  userName: string | null
  nameCounts: Map<string, number>
  subscriptionWeight: number
  otherWeight: number
}

function categoryWeight(row: MemoryRow, cutoffDate: string): number {
  switch (row.categorySource) {
    case 'user':
      return USER_WEIGHT
    case 'rule':
      return RULE_WEIGHT
    case 'ai':
      return (row.confidence ?? 0) >= AI_MIN_CONFIDENCE && row.date < cutoffDate ? AI_WEIGHT : 0
    default:
      // Memory answers must not reinforce themselves; unknown sources carry no weight
      return 0
  }
}

function mostCommon(counts: Map<string, number>): string | null {
  let best: string | null = null
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

/**
 * Build the memory from past transactions, keyed `${fingerprint}|${type}`.
 * `today` is an ISO date (YYYY-MM-DD).
 */
export function buildMemory(rows: MemoryRow[], today: string): Map<string, MemoryEntry> {
  const cutoff = new Date(new Date(today).getTime() - AI_MIN_AGE_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10)
  const entries = new Map<string, Accumulator>()

  for (const row of rows) {
    if (!row.fingerprint) continue
    const key = `${row.fingerprint}|${row.type}`
    let entry = entries.get(key)
    if (!entry) {
      entry = {
        fingerprint: row.fingerprint,
        type: row.type,
        votes: new Map(),
        rowCounts: new Map(),
        totalWeight: 0,
        userVotes: 0,
        strongestSource: null,
        name: null,
        isSubscription: false,
        sampleDescription: row.description,
        latestUpdate: -Infinity,
        latestUserNameUpdate: -Infinity,
        userName: null,
        nameCounts: new Map(),
        subscriptionWeight: 0,
        otherWeight: 0,
      }
      entries.set(key, entry)
    }

    const updated = new Date(row.updatedAt).getTime()
    if (updated >= entry.latestUpdate) {
      entry.latestUpdate = updated
      entry.sampleDescription = row.description
    }

    const weight = categoryWeight(row, cutoff)
    if (weight > 0) {
      entry.votes.set(row.category, (entry.votes.get(row.category) ?? 0) + weight)
      entry.rowCounts.set(row.category, (entry.rowCounts.get(row.category) ?? 0) + 1)
      entry.totalWeight += weight
      if (row.isSubscription) entry.subscriptionWeight += weight
      else entry.otherWeight += weight
      if (row.categorySource === 'user') {
        entry.userVotes++
        entry.strongestSource = 'user'
      } else if (row.categorySource === 'rule' && entry.strongestSource !== 'user') {
        entry.strongestSource = 'rule'
      } else if (row.categorySource === 'ai' && !entry.strongestSource) {
        entry.strongestSource = 'ai'
      }
    }

    const name = row.name?.trim()
    if (!name) continue
    if (row.nameSource === 'user' && updated >= entry.latestUserNameUpdate) {
      entry.latestUserNameUpdate = updated
      entry.userName = name
    }
    if (row.nameSource === 'user' || row.nameSource === 'rule' || row.nameSource === 'ai') {
      entry.nameCounts.set(name, (entry.nameCounts.get(name) ?? 0) + 1)
    }
  }

  const memory = new Map<string, MemoryEntry>()
  for (const [key, acc] of entries) {
    memory.set(key, {
      fingerprint: acc.fingerprint,
      type: acc.type,
      votes: acc.votes,
      rowCounts: acc.rowCounts,
      totalWeight: acc.totalWeight,
      userVotes: acc.userVotes,
      strongestSource: acc.strongestSource,
      name: acc.userName ?? mostCommon(acc.nameCounts),
      isSubscription: acc.subscriptionWeight > acc.otherWeight,
      sampleDescription: acc.sampleDescription,
    })
  }
  return memory
}

/** The category with the most weight and the share of the total weight it holds */
export function topCategory(entry: MemoryEntry): { category: string; share: number } | null {
  if (entry.totalWeight <= 0) return null
  let best: string | null = null
  let bestWeight = 0
  for (const [category, weight] of entry.votes) {
    if (weight > bestWeight) {
      best = category
      bestWeight = weight
    }
  }
  return best ? { category: best, share: bestWeight / entry.totalWeight } : null
}

/** The answer to reuse for a merchant, or null when the history is not settled enough */
export function resolveFromMemory(entry: MemoryEntry): ResolvedFromMemory | null {
  const top = topCategory(entry)
  if (!top || top.share < RESOLVE_MIN_SHARE || entry.totalWeight < RESOLVE_MIN_WEIGHT) return null
  // A transaction is saved with a name, so memory without one cannot answer
  if (!entry.name) return null
  return {
    category: top.category,
    name: entry.name,
    isSubscription: entry.isSubscription,
    confidence: entry.userVotes > 0 ? 0.95 : 0.85,
  }
}

/**
 * Bank and payment-network words that banks add to a counterparty name ("sagar singh axis").
 * Dropped before comparing names loosely.
 */
const BANK_WORDS = new Set([
  'axis',
  'icici',
  'hdfc',
  'sbi',
  'kotak',
  'idfc',
  'indusind',
  'yes',
  'pnb',
  'baroda',
  'bob',
  'canara',
  'union',
  'federal',
  'rbl',
  'au',
  'citi',
  'hsbc',
  'sc',
  'utib',
  'icic',
  'bank',
])

/** Shortest core that may match loosely: shorter ones collide between different merchants */
const LOOSE_MIN_CORE = 6
/** Confidence of an answer taken from loosely matching merchants */
const LOOSE_CONFIDENCE = 0.8

/** The fingerprint without bank words and spaces, or '' when it cannot be matched loosely (UPI ids) */
export function looseCore(fingerprint: string): string {
  if (fingerprint.startsWith('upi:')) return ''
  return fingerprint
    .split(' ')
    .filter((word) => !BANK_WORDS.has(word))
    .join('')
}

/**
 * Whether two different fingerprints look like the same counterparty cut off at different points.
 * Equal cores are the same name spaced differently ("sagarsingh" / "sagar singh"). Otherwise the
 * shorter core must be a prefix of the longer one that ends inside one of its words: ending on a
 * word boundary means whole extra words ("amazon" / "amazon bd"), which is a different merchant.
 */
export function looseMatches(a: string, b: string): boolean {
  if (a === b) return false
  const coreA = looseCore(a)
  const coreB = looseCore(b)
  if (coreA.length < LOOSE_MIN_CORE || coreB.length < LOOSE_MIN_CORE) return false
  if (coreA === coreB) return true
  const [shortCore, longCore, longFingerprint] =
    coreA.length < coreB.length ? [coreA, coreB, b] : [coreB, coreA, a]
  if (!longCore.startsWith(shortCore)) return false
  let offset = 0
  for (const word of longFingerprint.split(' ').filter((w) => !BANK_WORDS.has(w))) {
    offset += word.length
    if (offset === shortCore.length) return false
  }
  return true
}

/** Combine the loosely matching entries into one, named by the agreeing names or the user's pick */
function mergeEntries(
  fingerprint: string,
  type: string,
  matched: MemoryEntry[]
): MemoryEntry | null {
  const heaviest = matched.reduce((a, b) => (b.totalWeight > a.totalWeight ? b : a))
  const named = matched.filter((e) => e.name)
  const distinctNames = new Set(named.map((e) => e.name!.toLowerCase()))
  let source: MemoryEntry | undefined
  if (distinctNames.size === 1) {
    source = named.reduce((a, b) => (b.totalWeight > a.totalWeight ? b : a))
  } else if (distinctNames.size > 1) {
    // Names disagree: only a name the user chose settles it
    source = named
      .filter((e) => e.userVotes > 0)
      .reduce<
        MemoryEntry | undefined
      >((a, b) => (!a || b.totalWeight > a.totalWeight ? b : a), undefined)
  }
  if (!source) return null

  const votes = new Map<string, number>()
  const rowCounts = new Map<string, number>()
  for (const e of matched) {
    for (const [category, weight] of e.votes)
      votes.set(category, (votes.get(category) ?? 0) + weight)
    for (const [category, count] of e.rowCounts) {
      rowCounts.set(category, (rowCounts.get(category) ?? 0) + count)
    }
  }
  const sources = matched.map((e) => e.strongestSource)
  return {
    fingerprint,
    type,
    votes,
    rowCounts,
    totalWeight: matched.reduce((sum, e) => sum + e.totalWeight, 0),
    userVotes: matched.reduce((sum, e) => sum + e.userVotes, 0),
    strongestSource: sources.includes('user')
      ? 'user'
      : sources.includes('rule')
        ? 'rule'
        : sources.includes('ai')
          ? 'ai'
          : null,
    name: source.name,
    isSubscription: source.isSubscription,
    sampleDescription: heaviest.sampleDescription,
  }
}

/**
 * Find the remembered answer for a merchant: the exact fingerprint first, then, only when the
 * exact one has no history, the merchants whose names look like the same counterparty cut off
 * differently. A loose answer needs every matched merchant to agree on the category.
 */
export function lookupMemory(
  memory: Map<string, MemoryEntry>,
  fingerprint: string,
  type: string
): { entry: MemoryEntry; resolved: ResolvedFromMemory; match: 'exact' | 'loose' } | null {
  const exact = memory.get(`${fingerprint}|${type}`)
  if (exact) {
    const resolved = resolveFromMemory(exact)
    if (resolved) return { entry: exact, resolved, match: 'exact' }
    if (exact.totalWeight > 0) return null
  }

  const matched: MemoryEntry[] = []
  for (const candidate of memory.values()) {
    if (candidate.type !== type || candidate.totalWeight <= 0) continue
    if (looseMatches(fingerprint, candidate.fingerprint)) matched.push(candidate)
  }
  if (matched.length === 0) return null

  const entry = mergeEntries(fingerprint, type, matched)
  const top = entry && topCategory(entry)
  if (!entry || !top || !entry.name) return null
  if (top.share < RESOLVE_MIN_SHARE || entry.totalWeight < RESOLVE_MIN_WEIGHT) return null
  if (matched.some((e) => topCategory(e)?.category !== top.category)) return null

  return {
    entry,
    resolved: {
      category: top.category,
      name: entry.name,
      isSubscription: entry.isSubscription,
      confidence: LOOSE_CONFIDENCE,
    },
    match: 'loose',
  }
}

/**
 * Check the AI's confidence against history: disagreeing with a clear past majority sends the
 * transaction to Review, agreeing with it settles the transaction.
 */
export function adjustConfidence(
  entry: MemoryEntry | undefined,
  aiCategory: string,
  aiConfidence: number
): number {
  const top = entry ? topCategory(entry) : null
  if (!top || top.share < SANITY_MIN_SHARE) return aiConfidence
  return top.category === aiCategory
    ? Math.max(aiConfidence, AGREE_MIN_CONFIDENCE)
    : Math.min(aiConfidence, DISAGREE_MAX_CONFIDENCE)
}
