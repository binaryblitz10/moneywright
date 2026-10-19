import { and, desc, eq } from 'drizzle-orm'
import { db, tables, dbType } from '../db'
import type { TransactionRule as TransactionRuleRow } from '../db'
import { getCategoriesForCountry, type CountryCode } from '../lib/constants'
import {
  normalizeTerms,
  parseAmountLimit,
  parseMatchTerms,
  ruleMatches,
  type RuleForMatching,
} from '../lib/transaction-rules'
import { findUserById } from './user'

/**
 * Transaction rules service
 * Rules set the name and/or category of transactions whose description contains all of their terms,
 * optionally limited to one direction and an amount range
 */

/** Terms must add up to at least this many characters so a rule can't match everything */
const MIN_TERMS_LENGTH = 3

const PREVIEW_SAMPLE_COUNT = 5

type TransactionType = 'credit' | 'debit'

export interface TransactionRule {
  id: string
  matchTerms: string[]
  transactionType: TransactionType | null
  minAmount: number | null
  maxAmount: number | null
  name: string | null
  category: string | null
  matchCount: number
  createdAt: string
  updatedAt: string
}

export interface RuleInput {
  matchTerms?: string[]
  transactionType?: TransactionType | null
  minAmount?: number | null
  maxAmount?: number | null
  name?: string | null
  category?: string | null
}

/** What a rule matches on, as used for previews */
export interface RuleConditions {
  matchTerms: string[]
  transactionType?: TransactionType | null
  minAmount?: number | null
  maxAmount?: number | null
}

export interface RulePreview {
  count: number
  transactionIds: string[]
  samples: {
    id: string
    date: string
    type: TransactionType
    amount: number
    originalDescription: string
    summary: string | null
    category: string
  }[]
}

/**
 * Thrown when a rule fails validation; routes turn it into a 400
 */
export class RuleValidationError extends Error {}

/**
 * A rule with its terms parsed, as used for matching
 */
export type ParsedRule = RuleForMatching & { id: string }

function toParsedRule(row: TransactionRuleRow): ParsedRule {
  return {
    id: row.id,
    matchTerms: parseMatchTerms(row.matchTerms),
    transactionType:
      row.transactionType === 'credit' || row.transactionType === 'debit'
        ? row.transactionType
        : null,
    minAmount: parseAmountLimit(row.minAmount),
    maxAmount: parseAmountLimit(row.maxAmount),
    name: row.name,
    category: row.category,
    updatedAt: row.updatedAt,
  }
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value
}

function toResponse(row: TransactionRuleRow, matchCount: number): TransactionRule {
  const rule = toParsedRule(row)
  return {
    id: rule.id,
    matchTerms: rule.matchTerms,
    transactionType: rule.transactionType,
    minAmount: rule.minAmount,
    maxAmount: rule.maxAmount,
    name: rule.name,
    category: rule.category,
    matchCount,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  }
}

/**
 * Empty strings count as "not set"
 */
function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function hasEnoughTerms(terms: string[]): boolean {
  return terms.reduce((sum, term) => sum + term.length, 0) >= MIN_TERMS_LENGTH
}

async function validateCategory(userId: string, category: string): Promise<void> {
  const user = await findUserById(userId)
  const countryCode = (user?.country || 'US') as CountryCode
  if (!getCategoriesForCountry(countryCode).some((c) => c.code === category)) {
    throw new RuleValidationError('Unknown category')
  }
}

/**
 * Store an amount limit: Postgres decimals expect strings
 */
function toDbAmount(value: number | null): string | null {
  if (value === null) return null
  return (dbType === 'postgres' ? String(value) : value) as string
}

interface TransactionForMatching {
  id: string
  originalDescription: string
  type: string
  amount: string | number
}

function toMatchInput(t: TransactionForMatching): {
  description: string
  type: string
  amount: number
} {
  return { description: t.originalDescription, type: t.type, amount: Number(t.amount) }
}

/**
 * Fetch the fields of the user's transactions that rules are matched against
 */
async function fetchTransactionsForMatching(userId: string): Promise<TransactionForMatching[]> {
  return db
    .select({
      id: tables.transactions.id,
      originalDescription: tables.transactions.originalDescription,
      type: tables.transactions.type,
      amount: tables.transactions.amount,
    })
    .from(tables.transactions)
    .where(eq(tables.transactions.userId, userId))
}

function countMatches(rule: ParsedRule, transactions: TransactionForMatching[]): number {
  return transactions.filter((t) => ruleMatches(rule, toMatchInput(t))).length
}

/**
 * Get a user's rules in the form used for matching (newest first)
 */
export async function getRulesForUser(userId: string): Promise<ParsedRule[]> {
  const rows = await db
    .select()
    .from(tables.transactionRules)
    .where(eq(tables.transactionRules.userId, userId))
    .orderBy(desc(tables.transactionRules.createdAt))
  return rows.map(toParsedRule)
}

/**
 * List a user's rules (newest first) with the number of transactions each one matches
 */
export async function listRules(userId: string): Promise<TransactionRule[]> {
  const rows = await db
    .select()
    .from(tables.transactionRules)
    .where(eq(tables.transactionRules.userId, userId))
    .orderBy(desc(tables.transactionRules.createdAt))
  if (rows.length === 0) return []

  const transactions = await fetchTransactionsForMatching(userId)
  return rows.map((row) => toResponse(row, countMatches(toParsedRule(row), transactions)))
}

async function countRuleMatches(userId: string, row: TransactionRuleRow): Promise<number> {
  return countMatches(toParsedRule(row), await fetchTransactionsForMatching(userId))
}

/**
 * Validate rule values and normalize them for storage
 */
async function prepareRule(
  userId: string,
  input: Required<RuleInput>
): Promise<{
  matchTerms: string
  transactionType: TransactionType | null
  minAmount: string | null
  maxAmount: string | null
  name: string | null
  category: string | null
}> {
  const terms = normalizeTerms(input.matchTerms)
  if (terms.length === 0 || !hasEnoughTerms(terms)) {
    throw new RuleValidationError(`Terms must be at least ${MIN_TERMS_LENGTH} characters in total`)
  }

  const name = blankToNull(input.name)
  const category = blankToNull(input.category)
  if (!name && !category) {
    throw new RuleValidationError('A rule must set a name or a category')
  }
  if (category) await validateCategory(userId, category)

  const { minAmount, maxAmount } = input
  if ((minAmount !== null && minAmount < 0) || (maxAmount !== null && maxAmount < 0)) {
    throw new RuleValidationError('Amounts cannot be negative')
  }
  if (minAmount !== null && maxAmount !== null && minAmount > maxAmount) {
    throw new RuleValidationError('The lower amount must not be more than the upper amount')
  }

  return {
    matchTerms: JSON.stringify(terms),
    transactionType: input.transactionType,
    minAmount: toDbAmount(minAmount),
    maxAmount: toDbAmount(maxAmount),
    name,
    category,
  }
}

/**
 * Create a rule
 */
export async function createRule(userId: string, input: RuleInput): Promise<TransactionRule> {
  const values = await prepareRule(userId, {
    matchTerms: input.matchTerms ?? [],
    transactionType: input.transactionType ?? null,
    minAmount: input.minAmount ?? null,
    maxAmount: input.maxAmount ?? null,
    name: input.name ?? null,
    category: input.category ?? null,
  })

  // Set explicitly (with milliseconds) so rules created within the same second still sort correctly
  const now = dbType === 'postgres' ? new Date() : new Date().toISOString()
  const [row] = await db
    .insert(tables.transactionRules)
    .values({ userId, ...values, createdAt: now as Date, updatedAt: now as Date })
    .returning()
  return toResponse(row!, await countRuleMatches(userId, row!))
}

/**
 * Update a rule. Omitted fields keep their value; null or empty clears name/category.
 * Returns null when the rule doesn't exist for this user.
 */
export async function updateRule(
  userId: string,
  ruleId: string,
  input: RuleInput
): Promise<TransactionRule | null> {
  const [existing] = await db
    .select()
    .from(tables.transactionRules)
    .where(and(eq(tables.transactionRules.id, ruleId), eq(tables.transactionRules.userId, userId)))
    .limit(1)
  if (!existing) return null

  const current = toParsedRule(existing)
  const values = await prepareRule(userId, {
    matchTerms: input.matchTerms ?? current.matchTerms,
    transactionType:
      input.transactionType !== undefined ? input.transactionType : current.transactionType,
    minAmount: input.minAmount !== undefined ? input.minAmount : current.minAmount,
    maxAmount: input.maxAmount !== undefined ? input.maxAmount : current.maxAmount,
    name: input.name !== undefined ? input.name : current.name,
    category: input.category !== undefined ? input.category : current.category,
  })

  const now = dbType === 'postgres' ? new Date() : new Date().toISOString()
  const [row] = await db
    .update(tables.transactionRules)
    .set({ ...values, updatedAt: now as Date })
    .where(and(eq(tables.transactionRules.id, ruleId), eq(tables.transactionRules.userId, userId)))
    .returning()
  if (!row) return null
  return toResponse(row, await countRuleMatches(userId, row))
}

/**
 * Delete a rule. Returns false when the rule doesn't exist for this user.
 */
export async function deleteRule(userId: string, ruleId: string): Promise<boolean> {
  const deleted = await db
    .delete(tables.transactionRules)
    .where(and(eq(tables.transactionRules.id, ruleId), eq(tables.transactionRules.userId, userId)))
    .returning({ id: tables.transactionRules.id })
  return deleted.length > 0
}

/**
 * Find the transactions a rule with these conditions would match.
 * Empty or too-short terms match nothing, so the UI can call this while the user types.
 */
export async function previewRule(userId: string, input: RuleConditions): Promise<RulePreview> {
  const terms = normalizeTerms(input.matchTerms)
  if (terms.length === 0 || !hasEnoughTerms(terms)) {
    return { count: 0, transactionIds: [], samples: [] }
  }

  const rows = await db
    .select({
      id: tables.transactions.id,
      date: tables.transactions.date,
      type: tables.transactions.type,
      amount: tables.transactions.amount,
      originalDescription: tables.transactions.originalDescription,
      summary: tables.transactions.summary,
      category: tables.transactions.category,
    })
    .from(tables.transactions)
    .where(eq(tables.transactions.userId, userId))
    .orderBy(desc(tables.transactions.date))

  const rule = {
    matchTerms: terms,
    transactionType: input.transactionType ?? null,
    minAmount: input.minAmount ?? null,
    maxAmount: input.maxAmount ?? null,
  }
  const matches = rows.filter((t) => ruleMatches(rule, toMatchInput(t)))

  return {
    count: matches.length,
    transactionIds: matches.map((t) => t.id),
    samples: matches.slice(0, PREVIEW_SAMPLE_COUNT).map((t) => ({
      ...t,
      date: String(t.date),
      type: t.type as TransactionType,
      amount: Number(t.amount),
    })),
  }
}
