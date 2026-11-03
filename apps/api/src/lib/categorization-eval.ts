/**
 * Scoring helpers for the categorization evaluation script (scripts/eval-categorization.ts).
 * Pure functions, no I/O.
 */

/** What one arm answered for one test transaction (null category = not answered) */
export interface EvalAnswer {
  category: string | null
  name: string | null
}

/** What the user decided for that transaction */
export interface EvalTruth {
  category: string
  name: string | null
}

export interface ArmScore {
  rows: number
  answered: number
  /** Share of all rows that got an answer */
  coverage: number
  /** Share of answered rows whose category matches; null when nothing was answered */
  categoryAccuracy: number | null
  /** Share of answered rows with a case-insensitive exact name match; null when nothing was answered */
  nameMatchRate: number | null
}

/** Date (YYYY-MM-DD) at the given quantile of the sorted dates; null for an empty list */
export function splitDate(dates: string[], quantile: number = 0.8): string | null {
  if (dates.length === 0) return null
  const sorted = [...dates].sort()
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * quantile)))
  return sorted[index]!
}

/** Small seeded generator (mulberry32) so a sample can be repeated */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Up to `limit` items in a seeded random order; the input is not changed */
export function seededSample<T>(items: T[], limit: number, seed: number): T[] {
  const copy = [...items]
  const random = seededRandom(seed)
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy.slice(0, Math.max(0, limit))
}

function sameName(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** Score the answers of one arm against the truth, row by row (same index) */
export function scoreArm(answers: EvalAnswer[], truths: EvalTruth[]): ArmScore {
  const rows = truths.length
  let answered = 0
  let categoryHits = 0
  let nameHits = 0
  for (let i = 0; i < rows; i++) {
    const answer = answers[i]
    if (!answer || answer.category === null) continue
    answered++
    if (answer.category === truths[i]!.category) categoryHits++
    if (sameName(answer.name, truths[i]!.name)) nameHits++
  }
  return {
    rows,
    answered,
    coverage: rows === 0 ? 0 : answered / rows,
    categoryAccuracy: answered === 0 ? null : categoryHits / answered,
    nameMatchRate: answered === 0 ? null : nameHits / answered,
  }
}

/** Rough token count of a prompt (4 characters per token) */
export function approxTokens(chars: number): number {
  return Math.ceil(chars / 4)
}

export function formatPercent(value: number | null): string {
  return value === null ? '-' : `${(value * 100).toFixed(1)}%`
}
