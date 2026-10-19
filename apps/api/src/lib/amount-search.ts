/** Shorter numbers are too common inside amounts to match as partial text (every "5" in "1,250.50") */
const MIN_PARTIAL_LENGTH = 3

/** One term of a search box: a word, or a quoted phrase that is matched exactly */
export interface SearchTerm {
  text: string
  quoted: boolean
}

/**
 * Split a search into terms on whitespace; text in double quotes stays together as one exact term.
 * A quote left open (still typing) counts as closed at the end.
 */
export function parseSearchTerms(search: string): SearchTerm[] {
  const terms: SearchTerm[] = []
  for (const match of search.matchAll(/"([^"]*)"?|\S+/g)) {
    const quoted = match[1] !== undefined
    const text = (quoted ? match[1]! : match[0]).trim()
    if (text) terms.push({ text, quoted })
  }
  return terms
}

export type AmountSearch =
  | { kind: 'exact'; value: number }
  // `text` appears anywhere in the amount written with two decimals, e.g. "623" in 167623.58
  | { kind: 'partial'; text: string; rounded: number | null }
  // A short number matches the amounts it starts, to the precision typed (min inclusive, max exclusive)
  | { kind: 'range'; min: number; max: number; rounded: number | null }

/**
 * Turn a search term into an amount match, or null when it isn't a plain number.
 * Commas, spaces and currency symbols are ignored, so "1,67,623" and "₹167623" are the same.
 *
 * - quoted ("50"): exactly that amount, 50.00
 * - 3+ characters: anywhere in the amount, so "623" finds 167623.58
 * - shorter: by precision, so "50" finds 50.00 to 50.99 and "5.5" finds 5.50 to 5.59
 *
 * A whole number that isn't quoted also finds amounts that round to it (1,67,624 finds 167623.58).
 * The half-cent margins absorb float storage.
 */
export function parseAmountSearch(term: SearchTerm): AmountSearch | null {
  const cleaned = term.text.replace(/[₹$€£,\s]/g, '')
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null

  const value = Number(cleaned)
  if (term.quoted) return { kind: 'exact', value }

  const decimals = cleaned.split('.')[1]?.length
  const rounded = decimals === undefined ? value : null

  if (cleaned.length >= MIN_PARTIAL_LENGTH) return { kind: 'partial', text: cleaned, rounded }

  const step = Math.pow(10, -(decimals ?? 0))
  return { kind: 'range', min: value - 0.005, max: value + step - 0.005, rounded }
}
