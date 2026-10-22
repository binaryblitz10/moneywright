/**
 * Whether the text of a bank alert and the description of a statement line name the same
 * merchant. Alerts shorten names (`RAZORPAY SWI`) and statements write them in full
 * (`RAZORPAY*Swiggy Bangalore`), so words are compared by prefix, and gateway / bank filler words
 * that say nothing about the merchant are ignored. Pure functions, no I/O.
 */

const FILLER = new Set([
  'razorpay',
  'raz',
  'upi',
  'imps',
  'neft',
  'rtgs',
  'p2a',
  'p2m',
  'pvt',
  'ltd',
  'limited',
  'private',
  'india',
  'bank',
  'ref',
  'txn',
  'www',
  'com',
  'the',
  'and',
  'int',
  'inc',
])

const MIN_WORD_LENGTH = 3
/** Reference numbers (UPI / IMPS) at least this long identify one payment */
const MIN_REFERENCE_DIGITS = 6
/** A shortened word must share at least this many leading letters with the full word */
const MIN_PREFIX = 3

/** Meaningful lowercase words and reference numbers of a text */
export function significantTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => {
      if (/^\d+$/.test(token)) return token.length >= MIN_REFERENCE_DIGITS
      return token.length >= MIN_WORD_LENGTH && !FILLER.has(token)
    })
}

function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true
  if (/^\d+$/.test(a) || /^\d+$/.test(b)) return false
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.length >= MIN_PREFIX && long.startsWith(short)
}

/** How many words of the two texts match (0 = no overlap) */
export function overlapScore(a: string, b: string): number {
  const left = significantTokens(a)
  const right = significantTokens(b)
  return left.filter((l) => right.some((r) => tokensMatch(l, r))).length
}
