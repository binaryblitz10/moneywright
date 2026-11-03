/**
 * Reference numbers found in bank descriptions (UPI/IMPS RRNs, NEFT/RTGS UTRs).
 * A shared reference proves two rows are the same transaction, and two different
 * references prove they are not. Used by duplicate scoring and by statement import.
 */

/** UPI/IMPS retrieval reference numbers: exactly 12 digits, not part of a longer number */
const RRN_PATTERN = /(?<!\d)\d{12}(?!\d)/g

/** UTR-like tokens: 4 letters followed by 12-18 letters or digits, e.g. HDFCN52024010112345678 */
const UTR_PATTERN = /\b[A-Z]{4}[A-Z0-9]{12,18}\b/g

/** A UTR needs this many digits, so long all-letter words are not mistaken for one */
const MIN_UTR_DIGITS = 8

/** Milliseconds in a day */
const DAY_MS = 86_400_000

/**
 * Reference numbers in a description, upper-cased and without repeats.
 * Masked card numbers (4111XXXXXXXX1234, 4111 **** **** 1234) are not references.
 */
export function references(description: string): string[] {
  const found = new Set<string>()
  for (const match of description.match(RRN_PATTERN) ?? []) found.add(match)
  for (const match of description.toUpperCase().match(UTR_PATTERN) ?? []) {
    if ((match.match(/\d/g) ?? []).length >= MIN_UTR_DIGITS) found.add(match)
  }
  return [...found]
}

/** Whole days between two `YYYY-MM-DD` dates, ignoring order */
export function daysApart(a: string, b: string): number {
  return Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / DAY_MS)
}
