/**
 * Scores how sure we are that two transactions are the same one entered twice.
 * Builds on the loose description match in `duplicate-key.ts` and adds reference numbers,
 * which prove a match when shared and rule one out when both rows have different ones.
 */

import { descriptionsMatch } from './duplicate-key'
import { daysApart, references } from './duplicate-references'

export { references }

export type DuplicateSource = 'statement' | 'sms' | 'manual'

export type DuplicateTier = 'sure' | 'likely' | 'different' | 'none'

export interface DuplicateCandidate {
  accountId: string
  date: string
  type: string
  amount: number
  description: string
  statementId: string
  source: DuplicateSource
}

export interface DuplicateComparison {
  tier: DuplicateTier
  /** Short user-facing explanations of the verdict */
  reasons: string[]
}

/** A shared reference proves a match across this many days (statements post a day or two late) */
const REFERENCE_DAYS = 3

/** Without references, descriptions must match within this many days to be worth a look */
const LOOSE_DAYS = 2

/** Source of a transaction, from its hash prefix: bank message and manual rows are tagged */
export function sourceFromHash(hash: string): DuplicateSource {
  if (hash.startsWith('sms:')) return 'sms'
  if (hash.startsWith('manual:')) return 'manual'
  return 'statement'
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/**
 * Compare two transactions. Account, type and amount (to 2 decimals) must be equal, else `none`.
 * `different` means both carry reference numbers and none is shared.
 */
export function compareDuplicate(
  a: DuplicateCandidate,
  b: DuplicateCandidate
): DuplicateComparison {
  if (
    a.accountId !== b.accountId ||
    a.type !== b.type ||
    a.amount.toFixed(2) !== b.amount.toFixed(2)
  ) {
    return { tier: 'none', reasons: [] }
  }

  const refsA = references(a.description)
  const refsB = references(b.description)
  const shared = refsA.find((ref) => refsB.includes(ref))
  if (refsA.length > 0 && refsB.length > 0 && !shared) {
    return { tier: 'different', reasons: ['Different reference numbers'] }
  }

  const gap = daysApart(a.date, b.date)
  if (shared && gap <= REFERENCE_DAYS) {
    const reasons = [`Same reference number ${shared}`]
    if (gap > 0) reasons.push(`${plural(gap, 'day')} apart`)
    return { tier: 'sure', reasons }
  }

  if (!descriptionsMatch(a.description, b.description)) return { tier: 'none', reasons: [] }

  if (gap === 0) {
    const reasons = ['Same day, same amount, similar description']
    if (a.statementId !== b.statementId) {
      reasons.push(a.source === b.source ? 'From 2 different statements' : 'From different sources')
      return { tier: 'sure', reasons }
    }
    if (a.source !== b.source) {
      reasons.push('From different sources')
      return { tier: 'sure', reasons }
    }
    return { tier: 'likely', reasons }
  }

  if (gap <= LOOSE_DAYS && refsA.length === 0 && refsB.length === 0) {
    return {
      tier: 'likely',
      reasons: ['Same amount, similar description', `${plural(gap, 'day')} apart`],
    }
  }
  return { tier: 'none', reasons: [] }
}

const SOURCE_RANK: Record<DuplicateSource, number> = { statement: 0, sms: 1, manual: 2 }

export interface KeeperCandidate {
  id: string
  source: DuplicateSource
  createdAt: string | Date
}

/** The copy to keep: a statement row over an SMS one over a manual one, then oldest, then lowest id */
export function pickKeeper<T extends KeeperCandidate>(rows: readonly T[]): T | undefined {
  const created = (row: T): string =>
    row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt
  return [...rows].sort(
    (x, y) =>
      SOURCE_RANK[x.source] - SOURCE_RANK[y.source] ||
      created(x).localeCompare(created(y)) ||
      x.id.localeCompare(y.id)
  )[0]
}
