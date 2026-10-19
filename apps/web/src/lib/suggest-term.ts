function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Payment-method and routing words that never name the merchant or person */
const NOISE_WORDS = new Set([
  'upi',
  'imps',
  'neft',
  'rtgs',
  'ach',
  'nach',
  'dr',
  'cr',
  'pos',
  'ift',
  'inb',
  'mmt',
  'ecom',
  'pur',
  'bil',
  'inft',
  'tpft',
  'mob',
  'trf',
  'to',
  'from',
  'by',
  'ref',
  'payment',
  'purchase',
])

const MAX_SUGGESTED_WORDS = 2

/**
 * Suggest a "description contains" term for a transaction.
 * Prefers the transaction's saved name when its words appear in the description in order;
 * otherwise the longest run of adjacent plain words (no digits, no noise), capped at two words,
 * so the suggestion always matches the transaction it came from.
 */
export function suggestTerm(originalDescription: string, previousName: string | null): string {
  const description = originalDescription.toLowerCase()
  const nameWords = (previousName ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  if (nameWords.length > 0) {
    const pattern = new RegExp(`(?<![a-z0-9])${nameWords.map(escapeRegExp).join('[^a-z0-9]+')}`)
    if (pattern.test(description)) return nameWords.join(' ')
  }

  // Runs of words that are adjacent in the description; a digit or noise word ends a run
  let best: string[] = []
  let run: string[] = []
  for (const word of description.split(/[^a-z0-9]+/)) {
    if (word && !/\d/.test(word) && !NOISE_WORDS.has(word)) {
      run.push(word)
      if (run.length > best.length) best = [...run]
    } else if (word) {
      run = []
    }
  }
  return best.slice(0, MAX_SUGGESTED_WORDS).join(' ')
}
