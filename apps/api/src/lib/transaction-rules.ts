/**
 * Transaction rules matching
 *
 * A rule matches a transaction when every one of its terms matches the original description,
 * and the direction and amount agree when the rule limits them.
 * Pure functions, no database access, so imports and previews behave the same on SQLite and Postgres.
 */

export interface RuleForMatching {
  matchTerms: string[]
  transactionType: 'credit' | 'debit' | null
  /** Inclusive lower limit on the amount; null = no limit */
  minAmount: number | null
  /** Inclusive upper limit on the amount; null = no limit */
  maxAmount: number | null
  name: string | null
  category: string | null
  updatedAt: string | Date
}

export interface TransactionForRule {
  description: string
  type: string
  amount: number
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
 * Regex for a term: its words in order, separated by non-alphanumeric characters.
 * Every word must be a whole word, so "ola" does not match "COCA COLA".
 */
function buildTermRegex(term: string): RegExp {
  const body = term.split(' ').map(escapeRegExp).join(`${NOT_WORD_CHAR}+`)
  return new RegExp(`(?<!${WORD_CHAR})${body}(?!${WORD_CHAR})`, 'iu')
}

/**
 * Whether a single term matches a description, ignoring case.
 * The term's words must appear as whole words, in order.
 */
export function termMatches(term: string, description: string): boolean {
  const normalized = term.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!normalized) return false

  let regex = termRegexCache.get(normalized)
  if (!regex) {
    regex = buildTermRegex(normalized)
    termRegexCache.set(normalized, regex)
  }
  return regex.test(description)
}

/**
 * Parse a stored amount limit (Postgres decimals come back as strings). Returns null when unset.
 */
export function parseAmountLimit(value: string | number | null): number | null {
  if (value === null) return null
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

/**
 * Whether a rule matches a transaction: all terms must match, and the direction and amount
 * must agree when the rule limits them. Amount limits compare the absolute amount.
 */
export function ruleMatches(
  rule: Pick<RuleForMatching, 'matchTerms' | 'transactionType' | 'minAmount' | 'maxAmount'>,
  txn: TransactionForRule
): boolean {
  if (rule.matchTerms.length === 0) return false
  if (rule.transactionType && rule.transactionType !== txn.type) return false
  const amount = Math.abs(txn.amount)
  if (rule.minAmount !== null && amount < rule.minAmount) return false
  if (rule.maxAmount !== null && amount > rule.maxAmount) return false
  return rule.matchTerms.every((term) => termMatches(term, txn.description))
}

function amountLimitCount(rule: RuleForMatching): number {
  return (rule.minAmount !== null ? 1 : 0) + (rule.maxAmount !== null ? 1 : 0)
}

function totalTermLength(rule: RuleForMatching): number {
  return rule.matchTerms.reduce((sum, term) => sum + term.length, 0)
}

/**
 * Order rules from most to least specific: more terms, then more amount limits,
 * then longer terms overall, then most recently updated.
 */
function compareSpecificity(a: RuleForMatching, b: RuleForMatching): number {
  return (
    b.matchTerms.length - a.matchTerms.length ||
    amountLimitCount(b) - amountLimitCount(a) ||
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
