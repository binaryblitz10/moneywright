/**
 * Pure rules for pairing credit card bill payments.
 *
 * A bill payment shows up twice: a debit in a bank account (category `credit_card_payment`)
 * and a "payment received" credit in the card account. Links are stored as
 * - bank debit: `credit_card` -> card account id (step 1, known before the card statement exists)
 * - card credit: `transaction` -> bank debit id (step 2, once the card statement shows the payment)
 */

export const CARD_PAYMENT_CATEGORY = 'credit_card_payment'

/** How many days apart a bank debit and the card credit may be dated */
export const MAX_DAY_DIFF = 5
/** A debit equal to the latest statement balance within this amount identifies the card */
const BALANCE_MATCH_TOLERANCE = 1
const EXACT_AMOUNT = 0.005
/** A candidate this close in days (with an exact amount) is clearly the best */
const BEST_MAX_DAY_DIFF = 2
const MAX_SUGGESTIONS = 3
const DAY_MS = 86_400_000

/** Words that make a card credit in a generic category look like a bill payment */
const PAYMENT_WORDS = /\b(payment|thank you|received|autopay|auto pay|bbps|neft|imps|upi)\b/i
/** Card credit categories that may be payments when the description says so */
const AMBIGUOUS_CREDIT_CATEGORIES = new Set(['transfer', 'other'])

export interface PaymentTxn {
  id: string
  accountId: string
  date: string
  type: 'credit' | 'debit'
  amount: number
  category: string
  /** Original description and summary, joined */
  description: string
  isHidden: boolean
  linkedEntityId: string | null
  linkedEntityType: string | null
}

export interface PairMatch {
  debitId: string
  creditId: string
  amountDiff: number
  dayDiff: number
  /** 0-100, higher is better; for display only, ordering uses comparePairs */
  score: number
}

function toMs(date: string): number {
  return Date.parse(`${date.slice(0, 10)}T00:00:00Z`)
}

export function dayDifference(a: string, b: string): number {
  return Math.abs(Math.round((toMs(a) - toMs(b)) / DAY_MS))
}

/**
 * Amount tolerance for matching a payment to the card's "payment received" line.
 *
 * Tiered to handle cashback (CRED, etc.) and convenience fees: lower amounts get a higher
 * percentage because a fixed cashback weighs more on them.
 * < 5,000: 10% | < 20,000: 7% | < 50,000: 5% | < 100,000: 3% | above: 2%
 */
export function getAmountTolerance(amount: number): { min: number; max: number } {
  const absAmount = Math.abs(amount)

  let tolerancePercent: number
  if (absAmount < 5000) tolerancePercent = 0.1
  else if (absAmount < 20000) tolerancePercent = 0.07
  else if (absAmount < 50000) tolerancePercent = 0.05
  else if (absAmount < 100000) tolerancePercent = 0.03
  else tolerancePercent = 0.02

  const tolerance = absAmount * tolerancePercent
  return { min: absAmount - tolerance, max: absAmount + tolerance }
}

/**
 * Whether a card credit looks like a bill payment. Refunds, cashback and purchases-turned-credits
 * never do; `transfer` / `other` only when the description uses payment words.
 */
export function looksLikePayment(credit: Pick<PaymentTxn, 'category' | 'description'>): boolean {
  if (credit.category === CARD_PAYMENT_CATEGORY) return true
  return AMBIGUOUS_CREDIT_CATEGORIES.has(credit.category) && PAYMENT_WORDS.test(credit.description)
}

/** Whether a bank debit is a card payment that is free to pair with a card credit of `cardId` */
function debitCanPairWith(debit: PaymentTxn, cardId: string): boolean {
  if (debit.type !== 'debit' || debit.isHidden || debit.category !== CARD_PAYMENT_CATEGORY) {
    return false
  }
  if (!debit.linkedEntityId) return true
  return debit.linkedEntityType === 'credit_card' && debit.linkedEntityId === cardId
}

/** Whether a card credit is an unlinked payment line */
function creditCanPair(credit: PaymentTxn): boolean {
  return (
    credit.type === 'credit' &&
    !credit.isHidden &&
    !credit.linkedEntityId &&
    looksLikePayment(credit)
  )
}

/**
 * Score one debit/credit pair, or null when they cannot be the same payment.
 * `pointedAt` holds the debit ids some card credit already points at; `excludeIds` holds
 * transactions that must not be paired (ones the user unlinked by hand).
 */
export function evaluatePair(
  debit: PaymentTxn,
  credit: PaymentTxn,
  pointedAt: ReadonlySet<string>,
  excludeIds: ReadonlySet<string> = new Set()
): PairMatch | null {
  if (excludeIds.has(debit.id) || excludeIds.has(credit.id)) return null
  if (debit.accountId === credit.accountId || pointedAt.has(debit.id)) return null
  if (!debitCanPairWith(debit, credit.accountId) || !creditCanPair(credit)) return null

  const dayDiff = dayDifference(debit.date, credit.date)
  if (dayDiff > MAX_DAY_DIFF) return null

  const { min, max } = getAmountTolerance(debit.amount)
  if (credit.amount < min || credit.amount > max) return null

  const amountDiff = Math.abs(credit.amount - debit.amount)
  const tolerance = max - Math.abs(debit.amount)
  const exact = amountDiff < EXACT_AMOUNT
  const score = Math.round(
    100 - (exact ? 0 : 25) - Math.min(25, (amountDiff / (tolerance || 1)) * 25) - dayDiff * 4
  )
  return {
    debitId: debit.id,
    creditId: credit.id,
    amountDiff,
    dayDiff,
    score: Math.max(0, Math.min(100, score)),
  }
}

/** Best first: an exact amount, then the closest amount, then the closest date */
export function comparePairs(a: PairMatch, b: PairMatch): number {
  const aExact = a.amountDiff < EXACT_AMOUNT
  const bExact = b.amountDiff < EXACT_AMOUNT
  if (aExact !== bExact) return aExact ? -1 : 1
  if (!aExact && a.amountDiff !== b.amountDiff) return a.amountDiff - b.amountDiff
  return a.dayDiff - b.dayDiff
}

/** Every valid pairing of the given debits and credits, best first */
export function rankPairs(
  debits: PaymentTxn[],
  credits: PaymentTxn[],
  pointedAt: ReadonlySet<string>,
  excludeIds: ReadonlySet<string> = new Set()
): PairMatch[] {
  const pairs: PairMatch[] = []
  for (const debit of debits) {
    for (const credit of credits) {
      const pair = evaluatePair(debit, credit, pointedAt, excludeIds)
      if (pair) pairs.push(pair)
    }
  }
  return pairs.sort(comparePairs)
}

/** One pairing per debit and per credit, taking the best pairings first */
export function matchPayments(
  debits: PaymentTxn[],
  credits: PaymentTxn[],
  pointedAt: ReadonlySet<string>,
  excludeIds: ReadonlySet<string> = new Set()
): PairMatch[] {
  const usedDebits = new Set<string>()
  const usedCredits = new Set<string>()
  const chosen: PairMatch[] = []
  for (const pair of rankPairs(debits, credits, pointedAt, excludeIds)) {
    if (usedDebits.has(pair.debitId) || usedCredits.has(pair.creditId)) continue
    usedDebits.add(pair.debitId)
    usedCredits.add(pair.creditId)
    chosen.push(pair)
  }
  return chosen
}

/**
 * Pick the candidate to offer outright, or null when the user has to choose:
 * the only candidate, or the single one with an exact amount within 2 days.
 */
export function pickBest<T extends Pick<PairMatch, 'amountDiff' | 'dayDiff'>>(
  ranked: T[]
): T | null {
  if (ranked.length === 1) return ranked[0]!
  const strong = ranked.filter((c) => c.amountDiff < EXACT_AMOUNT && c.dayDiff <= BEST_MAX_DAY_DIFF)
  return strong.length === 1 ? strong[0]! : null
}

/** The candidates worth showing: the top few, best first */
export function topCandidates<T>(ranked: T[]): T[] {
  return ranked.slice(0, MAX_SUGGESTIONS)
}

/** Debits still to attach to a card: not paired, not linked, and not unlinked by hand */
export function debitsToAttach(
  debits: PaymentTxn[],
  pairedIds: ReadonlySet<string>,
  excludeIds: ReadonlySet<string>
): PaymentTxn[] {
  return debits.filter((d) => !pairedIds.has(d.id) && !d.linkedEntityId && !excludeIds.has(d.id))
}

/** Debit ids that some card credit points at */
export function pointedAtDebits(txns: Pick<PaymentTxn, 'linkedEntityId' | 'linkedEntityType'>[]) {
  const ids = new Set<string>()
  for (const t of txns) {
    if (t.linkedEntityType === 'transaction' && t.linkedEntityId) ids.add(t.linkedEntityId)
  }
  return ids
}

// ============================================================================
// Step 1: which card a bank debit paid
// ============================================================================

export interface CardInfo {
  id: string
  name: string
  /** Last 4 digits of the card number, when the number is known */
  last4: string | null
  /** Names the card's institution goes by in a bank description (id, display name, as typed) */
  institutionTerms: string[]
  /** Closing balance of the latest uploaded statement */
  latestBalance: number | null
}

export interface CardInference {
  accountId: string
  accountName: string
  reason: string
}

interface CardRule {
  matches: (card: CardInfo, debit: DebitInfo) => boolean
  reason: (card: CardInfo) => string
}

export interface DebitInfo {
  description: string
  amount: number
  /** Institution terms of the paying bank account; its name appears in every one of its debits */
  ownInstitutionTerms: string[]
}

function normalizeText(value: string): string {
  return value.toLowerCase()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Whether `term` appears in `text` as a whole word (or words), ignoring case */
export function mentionsWord(text: string, term: string): boolean {
  const trimmed = term.trim()
  if (!trimmed) return false
  return new RegExp(`(?<![a-z0-9])${escapeRegExp(normalizeText(trimmed))}(?![a-z0-9])`).test(
    normalizeText(text)
  )
}

function mentionsLast4(text: string, last4: string): boolean {
  return new RegExp(`(?<!\\d)${last4}(?!\\d)`).test(text)
}

/** Rules in priority order; all are about one card at a time */
const CARD_RULES: CardRule[] = [
  {
    matches: (card, debit) => !!card.last4 && mentionsLast4(debit.description, card.last4),
    reason: (card) => `Card ending ${card.last4} is in the description`,
  },
  {
    matches: (card, debit) => {
      const own = debit.ownInstitutionTerms.map(normalizeText)
      return card.institutionTerms.some(
        (term) => !own.includes(normalizeText(term)) && mentionsWord(debit.description, term)
      )
    },
    reason: () => "The card's bank is named in the description",
  },
  {
    matches: (card, debit) =>
      card.latestBalance !== null &&
      Math.abs(card.latestBalance - debit.amount) <= BALANCE_MATCH_TOLERANCE,
    reason: () => 'Same amount as the latest card statement',
  },
]
const ONLY_CARD_REASON = 'Only card you have'

/**
 * The card a bank debit paid, when it can be told with confidence.
 * Rules in order: (a) the last 4 digits of the card number are in the description, (b) the card's
 * institution is named in the description (the paying bank's own name does not count),
 * (c) the amount equals the latest statement balance, (d) the user has just one card.
 * A rule that fits several cards narrows the choice for the next rule; one that fits none is skipped.
 * If several cards remain, null.
 */
export function inferCard(debit: DebitInfo, cards: CardInfo[]): CardInference | null {
  let pool = cards
  for (const rule of CARD_RULES) {
    const matched = pool.filter((card) => rule.matches(card, debit))
    if (matched.length === 1) {
      const card = matched[0]!
      return { accountId: card.id, accountName: card.name, reason: rule.reason(card) }
    }
    if (matched.length > 1) pool = matched
  }
  if (cards.length === 1) {
    const card = cards[0]!
    return { accountId: card.id, accountName: card.name, reason: ONLY_CARD_REASON }
  }
  return null
}

/**
 * Every card with some reason to be the one a debit paid, best reason first,
 * for the user to choose from (not only the single confident answer).
 */
export function cardSuggestions(debit: DebitInfo, cards: CardInfo[]): CardInference[] {
  const result: CardInference[] = []
  for (const rule of CARD_RULES) {
    for (const card of cards) {
      if (result.some((r) => r.accountId === card.id) || !rule.matches(card, debit)) continue
      result.push({ accountId: card.id, accountName: card.name, reason: rule.reason(card) })
    }
  }
  if (cards.length === 1 && result.length === 0) {
    const card = cards[0]!
    result.push({ accountId: card.id, accountName: card.name, reason: ONLY_CARD_REASON })
  }
  return result
}

// ============================================================================
// Undoing a link: both sides
// ============================================================================

export interface LinkRef {
  id: string
  linkedEntityId: string | null
  linkedEntityType: string | null
}

/**
 * Every transaction whose link must be cleared to undo the links of `selected`:
 * the rows themselves, the rows pointing at them, and the transaction each of them points at.
 * `inboundIds` are the ids of the rows with `transaction` links to any selected row.
 */
export function idsToClear(selected: LinkRef[], inboundIds: string[]): string[] {
  const ids = new Set<string>(selected.map((t) => t.id))
  for (const id of inboundIds) ids.add(id)
  for (const t of selected) {
    if (t.linkedEntityType === 'transaction' && t.linkedEntityId) ids.add(t.linkedEntityId)
  }
  return [...ids]
}
