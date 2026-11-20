/**
 * Split matches: a hand-entered (or bank message) purchase made in a foreign currency is often
 * entered with the forex markup and tax included, while the statement lists the purchase and each
 * fee as separate lines. When the purchase line plus its fee lines add up to the entered amount
 * to the cent, they are the same spending.
 */

import { daysApart } from './duplicate-references'

export interface SplitRow {
  id: string
  accountId: string
  date: string
  type: string
  amount: number
  description: string
}

export interface SplitMatch {
  /** The hand-entered or bank message transaction */
  provisionalId: string
  /** The statement line of the purchase itself: the one the provisional row is merged into */
  mainId: string
  /** The statement lines for the markup and tax that make up the rest of the amount */
  feeIds: string[]
}

/** The provisional row's date may differ from the statement's by this many days */
const MAIN_DAYS = 2

/** Fee lines are posted on the day of the purchase line, or the day around it */
const FEE_DAYS = 1

/** More fee lines than this near one purchase is not a pattern worth trying every sum of */
const MAX_FEES = 8

/** Descriptions of the lines a card issuer adds to a foreign purchase */
const FEE_PATTERN =
  /issuer\s+markup|markup\s+assessment|forex\s+(?:markup|fee)|cross[\s-]?currency|\b[ics]?gst\b|\bigst\b/i

export function isFeeLine(description: string): boolean {
  return FEE_PATTERN.test(description)
}

function cents(amount: number): number {
  return Math.round(amount * 100)
}

/** Every non-empty combination of the fees whose total is `target` cents */
function feeCombinations(fees: SplitRow[], target: number): SplitRow[][] {
  const found: SplitRow[][] = []
  const walk = (from: number, chosen: SplitRow[], total: number): void => {
    if (total === target && chosen.length > 0) found.push(chosen)
    if (total >= target) return
    for (let i = from; i < fees.length; i++) {
      walk(i + 1, [...chosen, fees[i]!], total + cents(fees[i]!.amount))
    }
  }
  walk(0, [], 0)
  return found
}

/**
 * The fee lines that, with the purchase line `main`, add up to `entered`: the markup and tax of a
 * purchase merged by a split match. Null unless exactly one set of the given lines explains it.
 */
export function feeLinesFor(
  entered: SplitRow,
  main: SplitRow,
  lines: readonly SplitRow[]
): SplitRow[] | null {
  const fees = lines.filter(
    (line) =>
      line.id !== main.id &&
      line.accountId === main.accountId &&
      line.type === main.type &&
      isFeeLine(line.description) &&
      daysApart(line.date, main.date) <= FEE_DAYS
  )
  if (fees.length === 0 || fees.length > MAX_FEES) return null
  const found = feeCombinations(fees, cents(entered.amount) - cents(main.amount))
  return found.length === 1 ? found[0]! : null
}

/**
 * Find the provisional rows that equal one statement purchase plus its fee lines. A match must be
 * the only way to explain the provisional row, and none of its statement lines may also be claimed
 * by another provisional row; anything ambiguous is left out.
 */
export function findSplitMatches(
  provisional: readonly SplitRow[],
  lines: readonly SplitRow[],
  isDismissed: (provisionalId: string, mainId: string) => boolean = () => false
): SplitMatch[] {
  const matches: SplitMatch[] = []

  for (const row of provisional) {
    const sameAccount = lines.filter(
      (line) => line.accountId === row.accountId && line.type === row.type
    )
    // A line with exactly this amount is an ordinary match, handled elsewhere
    if (sameAccount.some((line) => cents(line.amount) === cents(row.amount))) continue

    const solutions: SplitMatch[] = []
    for (const main of sameAccount) {
      if (isFeeLine(main.description)) continue
      if (cents(main.amount) >= cents(row.amount)) continue
      if (daysApart(main.date, row.date) > MAIN_DAYS) continue
      if (isDismissed(row.id, main.id)) continue

      const fees = sameAccount.filter(
        (line) => isFeeLine(line.description) && daysApart(line.date, main.date) <= FEE_DAYS
      )
      if (fees.length === 0 || fees.length > MAX_FEES) continue
      for (const combo of feeCombinations(fees, cents(row.amount) - cents(main.amount))) {
        solutions.push({
          provisionalId: row.id,
          mainId: main.id,
          feeIds: combo.map((fee) => fee.id).sort(),
        })
      }
    }
    if (solutions.length === 1) matches.push(solutions[0]!)
  }

  // Two provisional rows claiming the same statement line cannot both be right
  const claims = new Map<string, number>()
  for (const match of matches) {
    for (const id of [match.mainId, ...match.feeIds]) claims.set(id, (claims.get(id) ?? 0) + 1)
  }
  return matches.filter((match) =>
    [match.mainId, ...match.feeIds].every((id) => claims.get(id) === 1)
  )
}
