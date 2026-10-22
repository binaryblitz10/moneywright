/**
 * Pairing of SMS-imported transactions with the statement lines that describe the same purchase.
 *
 * Two transactions can only be the same purchase when account, date, direction and amount are all
 * equal. Among those, a pair counts as a confirmed match when the merchant texts overlap; pairs
 * that agree on the numbers but not on the text are only possible matches for the user to decide.
 * Matching is one-to-one, so several identical purchases pair up without being confused.
 */

import { overlapScore } from './match'

export interface PairRow {
  id: string
  accountId: string
  date: string
  type: string
  amount: string | number
  originalDescription: string
}

export interface PairResult<T extends PairRow> {
  /** Same numbers and overlapping text */
  matched: Array<{ sms: T; target: T }>
  /** Same numbers, different text: SMS transactions with the statement lines they might be */
  possible: Array<{ sms: T; candidates: T[] }>
}

function groupKey(row: PairRow): string {
  return [row.accountId, row.date, row.type, Number(row.amount).toFixed(2)].join('|')
}

function groupBy<T extends PairRow>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const key = groupKey(row)
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  return groups
}

/**
 * @param isDismissed whether the user already said an SMS transaction and a candidate are
 *   different purchases; such a pair is never offered again
 */
export function pairTransactions<T extends PairRow>(
  smsRows: T[],
  candidates: T[],
  isDismissed: (smsId: string, targetId: string) => boolean = () => false
): PairResult<T> {
  const result: PairResult<T> = { matched: [], possible: [] }
  const candidateGroups = groupBy(candidates)

  for (const [key, sms] of groupBy(smsRows)) {
    const targets = candidateGroups.get(key) ?? []
    if (targets.length === 0) continue

    // Best overlap first, so the closest texts pair up before looser ones
    const scored = sms
      .flatMap((s) =>
        targets.map((t) => ({
          sms: s,
          target: t,
          score: overlapScore(s.originalDescription, t.originalDescription),
        }))
      )
      .filter((pair) => pair.score > 0)
      .sort((a, b) => b.score - a.score)

    const usedSms = new Set<string>()
    const usedTargets = new Set<string>()
    for (const { sms: s, target: t } of scored) {
      if (usedSms.has(s.id) || usedTargets.has(t.id)) continue
      usedSms.add(s.id)
      usedTargets.add(t.id)
      result.matched.push({ sms: s, target: t })
    }

    const leftoverTargets = targets.filter((t) => !usedTargets.has(t.id))
    for (const s of sms) {
      if (usedSms.has(s.id)) continue
      const options = leftoverTargets.filter((t) => !isDismissed(s.id, t.id))
      if (options.length > 0) result.possible.push({ sms: s, candidates: options })
    }
  }

  return result
}
