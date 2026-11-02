/**
 * Duplicate detection helpers shared by the duplicate review list and statement import,
 * so both always agree on what counts as "the same transaction".
 *
 * Two transactions are likely the same when account, date, type and amount (to 2 decimals)
 * are equal and their descriptions loosely match: the same bank prints the same transaction
 * with different text across statements (extra prefixes, channel names, trimmed references).
 */

export interface DuplicateKeyInput {
  accountId: string
  date: string
  type: string
  amount: number
  description: string
}

/** Share of the shorter description's words that must appear in the other for a loose match */
const MIN_WORD_OVERLAP = 0.75

function normalizeDescription(description: string): string {
  return description.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Words of a description: runs of letters or digits, so `A/B-C` and `a b c` compare equal */
function descriptionWords(description: string): Set<string> {
  return new Set(description.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
}

/**
 * Key for everything except the description: transactions in the same bucket
 * are duplicates when their descriptions loosely match.
 */
export function duplicateBucketKey(input: Omit<DuplicateKeyInput, 'description'>): string {
  return [input.accountId, input.date, input.type, input.amount.toFixed(2)].join('|')
}

/** Exact key (bucket plus normalized description), used to name a duplicate group */
export function duplicateKey(input: DuplicateKeyInput): string {
  return `${duplicateBucketKey(input)}|${normalizeDescription(input.description)}`
}

/**
 * Whether two descriptions loosely match: one is a trimmed or prefixed form of the other,
 * i.e. at least 75% of the shorter one's words appear in the longer one.
 * Descriptions with no words only match when they are identical.
 */
export function descriptionsMatch(a: string, b: string): boolean {
  if (normalizeDescription(a) === normalizeDescription(b)) return true
  const wordsA = descriptionWords(a)
  const wordsB = descriptionWords(b)
  const [small, large] = wordsA.size <= wordsB.size ? [wordsA, wordsB] : [wordsB, wordsA]
  if (small.size === 0) return false
  let shared = 0
  for (const word of small) if (large.has(word)) shared++
  return shared / small.size >= MIN_WORD_OVERLAP
}

/**
 * Pick the rows that still need inserting when some of them already exist.
 * Each existing transaction (grouped by bucket key, as descriptions) cancels out at most one
 * incoming row with a loosely matching description, in file order, so identical same-day
 * rows inside one file are kept unless they are already present.
 */
export function selectRowsToInsert<T>(
  rows: T[],
  existing: ReadonlyMap<string, readonly string[]>,
  bucketOf: (row: T) => string,
  descriptionOf: (row: T) => string
): { toInsert: T[]; skipped: number } {
  const remaining = new Map<string, string[]>()
  for (const [bucket, descriptions] of existing) remaining.set(bucket, [...descriptions])
  const toInsert: T[] = []
  let skipped = 0
  for (const row of rows) {
    const candidates = remaining.get(bucketOf(row))
    const index = candidates?.findIndex((d) => descriptionsMatch(d, descriptionOf(row))) ?? -1
    if (candidates && index >= 0) {
      candidates.splice(index, 1)
      skipped++
    } else {
      toInsert.push(row)
    }
  }
  return { toInsert, skipped }
}

/**
 * Cluster items that are likely the same transaction. Items are compared in the order given;
 * the first of a cluster names it. Returns clusters keyed by `duplicateKey` of that first item.
 */
export function clusterDuplicates<T>(
  items: T[],
  keyInputOf: (item: T) => DuplicateKeyInput
): Map<string, T[]> {
  const buckets = new Map<string, { description: string; items: T[] }[]>()
  const clusters = new Map<string, T[]>()
  for (const item of items) {
    const input = keyInputOf(item)
    const bucket = duplicateBucketKey(input)
    const inBucket = buckets.get(bucket) ?? []
    buckets.set(bucket, inBucket)
    const match = inBucket.find((c) => descriptionsMatch(c.description, input.description))
    if (match) {
      match.items.push(item)
    } else {
      const key = duplicateKey(input)
      const cluster = { description: input.description, items: [item] }
      inBucket.push(cluster)
      clusters.set(key, cluster.items)
    }
  }
  return clusters
}
