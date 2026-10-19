/**
 * Transaction rules matching
 *
 * A rule matches a transaction when every one of its terms matches the original description.
 * Pure functions, no database access, so imports and previews behave the same on SQLite and Postgres.
 */

export interface RuleForMatching {
  matchTerms: string[]
  transactionType: 'credit' | 'debit' | null
  name: string | null
  category: string | null
  updatedAt: string | Date
}

export interface TransactionForRule {
  description: string
  type: string
}

// A letter or digit (any script)
const WORD_CHAR = '[\\p{L}\\p{N}]'
const NOT_WORD_CHAR = '[^\\p{L}\\p{N}]'

const termRegexCache = new Map<string, RegExp>()

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Parse the JSON array of terms stored on a rule. Returns an empty list for unusable data.
 */
export function parseMatchTerms(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

/**
 * Trim, lowercase, collapse inner whitespace, drop empty terms and duplicates
 */
export function normalizeTerms(terms: string[]): string[] {
  const seen = new Set<string>()
  for (const term of terms) {
    const normalized = term.trim().toLowerCase().replace(/\s+/g, ' ')
    if (normalized) seen.add(normalized)
  }
  return [...seen]
}

/**
 * Regex for a multi-word term: the words in order, separated by non-alphanumeric characters.
 * Every word except the last must be a whole word; the last may be the start of a longer word.
 */
function buildPhraseRegex(term: string): RegExp {
  const words = term.split(' ').map(escapeRegExp)
  const body = words
    .map((word, i) => (i < words.length - 1 ? `${word}(?!${WORD_CHAR})` : word))
    .join(`${NOT_WORD_CHAR}+`)
  return new RegExp(`(?<!${WORD_CHAR})${body}`, 'iu')
}

/**
 * Whether a single term matches a description, ignoring case.
 * One-word terms match anywhere inside the description; terms with spaces match as a phrase.
 */
export function termMatches(term: string, description: string): boolean {
  const normalized = term.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!normalized) return false

  if (!normalized.includes(' ')) {
    return description.toLowerCase().includes(normalized)
  }

  let regex = termRegexCache.get(normalized)
  if (!regex) {
    regex = buildPhraseRegex(normalized)
    termRegexCache.set(normalized, regex)
  }
  return regex.test(description)
}

/**
 * Whether a rule matches a transaction: all terms must match, and the direction must agree
 * when the rule is limited to one.
 */
export function ruleMatches(
  rule: Pick<RuleForMatching, 'matchTerms' | 'transactionType'>,
  txn: TransactionForRule
): boolean {
  if (rule.matchTerms.length === 0) return false
  if (rule.transactionType && rule.transactionType !== txn.type) return false
  return rule.matchTerms.every((term) => termMatches(term, txn.description))
}

function totalTermLength(rule: RuleForMatching): number {
  return rule.matchTerms.reduce((sum, term) => sum + term.length, 0)
}

/**
 * Order rules from most to least specific: more terms, then longer terms overall,
 * then most recently updated.
 */
function compareSpecificity(a: RuleForMatching, b: RuleForMatching): number {
  return (
    b.matchTerms.length - a.matchTerms.length ||
    totalTermLength(b) - totalTermLength(a) ||
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}

/**
 * Resolve the name and category for a transaction from all matching rules.
 * Each field comes from the most specific matching rule that sets it.
 */
export function resolveRuleFields(
  rules: RuleForMatching[],
  txn: TransactionForRule
): { name?: string; category?: string } {
  const matching = rules.filter((rule) => ruleMatches(rule, txn)).sort(compareSpecificity)

  const result: { name?: string; category?: string } = {}
  for (const rule of matching) {
    if (result.name === undefined && rule.name) result.name = rule.name
    if (result.category === undefined && rule.category) result.category = rule.category
  }
  return result
}
