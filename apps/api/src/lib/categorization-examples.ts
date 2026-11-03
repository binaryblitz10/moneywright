/**
 * Few-shot context for the categorizer: picks the past decisions that look like the
 * transactions being categorized and formats them, with the user's recent corrections of the
 * AI, for the prompt. Pure functions, no I/O.
 */

import { topCategory, type MemoryEntry } from './categorization-memory'
import { overlapScore } from './sms/match'

const EXAMPLES_PER_TRANSACTION = 3
const MAX_EXAMPLES = 120
const MAX_CORRECTIONS = 40
const MAX_DESCRIPTION_LENGTH = 80
/** Entries whose top category holds less than this share show their spread */
const SETTLED_SHARE = 0.9

const SOURCE_LABELS = { user: 'you', rule: 'rule', ai: 'AI' } as const

/** A transaction about to be categorized */
export interface ExampleQuery {
  id: string
  description: string
  type: string
}

/** A past correction of an AI or memory answer */
export interface CorrectionEvent {
  merchantFingerprint: string | null
  description: string
  fromValue: string | null
  toValue: string | null
}

function truncate(text: string): string {
  const clean = text.replace(/\s+/g, ' ').replace(/"/g, "'").trim()
  return clean.length > MAX_DESCRIPTION_LENGTH
    ? `${clean.slice(0, MAX_DESCRIPTION_LENGTH)}...`
    : clean
}

/** The past decisions most like the given transactions, best matches first */
export function selectExamples(
  memory: Map<string, MemoryEntry>,
  transactions: ExampleQuery[]
): MemoryEntry[] {
  const candidates = [...memory.values()].filter((e) => e.totalWeight > 0 && e.name)
  const picked = new Map<string, MemoryEntry>()

  for (const txn of transactions) {
    const scored: { entry: MemoryEntry; score: number }[] = []
    for (const entry of candidates) {
      if (entry.type !== txn.type) continue
      const score = overlapScore(entry.sampleDescription, txn.description)
      if (score > 0) scored.push({ entry, score })
    }
    scored.sort((a, b) => b.score - a.score || b.entry.totalWeight - a.entry.totalWeight)
    for (const { entry } of scored.slice(0, EXAMPLES_PER_TRANSACTION)) {
      picked.set(`${entry.fingerprint}|${entry.type}`, entry)
    }
  }

  return [...picked.values()].slice(0, MAX_EXAMPLES)
}

/** One line per past decision: `"<description>" → <name> | <category> [you|rule|AI]` */
export function formatPastDecisions(entries: MemoryEntry[]): string {
  const lines: string[] = []
  for (const entry of entries) {
    const top = topCategory(entry)
    if (!top || !entry.name || !entry.strongestSource) continue
    let line = `"${truncate(entry.sampleDescription)}" → ${entry.name} | ${top.category} [${SOURCE_LABELS[entry.strongestSource]}]`
    if (top.share < SETTLED_SHARE) {
      const spread = [...entry.rowCounts]
        .sort((a, b) => b[1] - a[1])
        .map(([category, count]) => `${category}×${count}`)
        .join(', ')
      line += ` (past: ${spread})`
    }
    lines.push(line)
  }
  return lines.join('\n')
}

/** One line per merchant the user corrected: `"<desc>": AI said X → you chose Y` */
export function formatCorrections(events: CorrectionEvent[]): string {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const event of events) {
    if (!event.fromValue || !event.toValue) continue
    const key = event.merchantFingerprint || event.description
    if (seen.has(key)) continue
    seen.add(key)
    lines.push(
      `"${truncate(event.description)}": AI said ${event.fromValue} → you chose ${event.toValue}`
    )
    if (lines.length >= MAX_CORRECTIONS) break
  }
  return lines.join('\n')
}
