/**
 * Matching of account / card numbers as printed on statements.
 *
 * Statements show numbers in many masked forms (`XXXX1234`, `****1234`, `4572 XXXX XXXX 1234`),
 * so two strings that differ can still describe the same account.
 */

export interface AccountMatchContext {
  institution?: string | null
  type?: string | null
}

export interface AccountMatchSide extends AccountMatchContext {
  accountNumber: string | null | undefined
}

/** Digits that must be compared before a match is trusted without institution/type */
const MIN_COMPARED_DIGITS = 8
const LAST_DIGITS = 4

const MASK_CHARS = /[X*•●○×∗#]/g

/** Uppercase, drop spaces/dashes/separators and turn every mask symbol into `X` */
export function normalizeAccountNumber(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .trim()
    .toUpperCase()
    .replace(MASK_CHARS, 'X')
    .replace(/[^A-Z0-9]/g, '')
}

/** Last 4 visible characters of a number, or null when it ends in a mask or is too short */
export function getLast4(value: string | null | undefined): string | null {
  const normalized = normalizeAccountNumber(value)
  const last = normalized.slice(-LAST_DIGITS)
  return last.length === LAST_DIGITS && !last.includes('X') ? last : null
}

function sameId(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = a?.trim().toLowerCase()
  const right = b?.trim().toLowerCase()
  return !!left && !!right && left === right
}

/**
 * Whether two account numbers describe the same account.
 *
 * - Both unmasked: the full numbers must be equal.
 * - Either masked: the visible trailing digits must match (at least the last 4), and the visible
 *   leading digits must match when both sides show them.
 * - If fewer than 8 digits could be compared (typically only the last 4), the institution and
 *   account type of both sides must be known and equal, so different cards from different banks
 *   that share the last 4 digits are never merged.
 */
export function accountNumbersMatch(
  a: AccountMatchSide | string | null | undefined,
  b: AccountMatchSide | string | null | undefined
): boolean {
  const left: AccountMatchSide = typeof a === 'string' || !a ? { accountNumber: a } : a
  const right: AccountMatchSide = typeof b === 'string' || !b ? { accountNumber: b } : b

  const x = normalizeAccountNumber(left.accountNumber)
  const y = normalizeAccountNumber(right.accountNumber)
  if (!x || !y) return false

  const xMasked = x.includes('X')
  const yMasked = y.includes('X')

  if (!xMasked && !yMasked) return x === y

  // Visible trailing characters (after the last mask) and leading characters (before the first)
  const suffix = (s: string): string => s.slice(s.lastIndexOf('X') + 1)
  const prefix = (s: string): string => (s.includes('X') ? s.slice(0, s.indexOf('X')) : s)
  const xSuffix = xMasked ? suffix(x) : x
  const ySuffix = yMasked ? suffix(y) : y
  const xPrefix = prefix(x)
  const yPrefix = prefix(y)

  // Every masked side must show at least its last 4
  if (xMasked && xSuffix.length < LAST_DIGITS) return false
  if (yMasked && ySuffix.length < LAST_DIGITS) return false

  const suffixLen = Math.min(xSuffix.length, ySuffix.length)
  if (suffixLen < LAST_DIGITS) return false
  if (xSuffix.slice(-suffixLen) !== ySuffix.slice(-suffixLen)) return false

  let compared = suffixLen
  if (xPrefix && yPrefix) {
    const prefixLen = Math.min(xPrefix.length, yPrefix.length)
    if (xPrefix.slice(0, prefixLen) !== yPrefix.slice(0, prefixLen)) return false
    compared += prefixLen
  }

  if (compared >= MIN_COMPARED_DIGITS) return true

  return sameId(left.institution, right.institution) && sameId(left.type, right.type)
}
