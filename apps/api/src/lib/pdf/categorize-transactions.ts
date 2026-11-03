/**
 * Batch transaction categorization using LLM
 * Sends all transactions together for better pattern recognition
 * (e.g., recurring salary, regular bills)
 *
 * Supports streaming mode with mini-batches for real-time updates
 */

import { eq, inArray, and, isNull } from 'drizzle-orm'
import { createLLMClientFromSettings, LLM_TIMEOUT_MS, type LLMClientResult } from '../../llm'
import {
  getCategoriesForCountry,
  type CategoryKind,
  type CountryCode,
  type LabelSource,
} from '../constants'
import { db, tables, dbType } from '../../db'
import { logger } from '../logger'
import { resolveRuleFields } from '../transaction-rules'
import { getRulesForUser } from '../../services/transaction-rules'
import { loadMemory, loadRecentCorrections } from '../../services/categorization-learning'
import { adjustConfidence, lookupMemory, type MemoryEntry } from '../categorization-memory'
import { formatCorrections, formatPastDecisions, selectExamples } from '../categorization-examples'
import { merchantFingerprint } from '../merchant-fingerprint'
import { parseCSVLine, quoteCSVField, streamCsvLines } from './csv'
import {
  NAME_FORMAT,
  NAME_VERSION,
  buildNamesInUseSection,
  getNamesInUse,
} from './transaction-names'
import type { CategorizedTransaction, TransactionForCategorization } from './types'

/** A transaction waiting for a category, with the key its merchant is remembered by */
interface PendingTransaction extends TransactionForCategorization {
  fingerprint: string
}

/** A categorization result together with who chose the category and the name */
interface LabeledCategorization extends CategorizedTransaction {
  categorySource: LabelSource
  nameSource: LabelSource
}

/** What the categorizer has learned from this user, loaded once per run */
export interface LearningContext {
  memory: Map<string, MemoryEntry>
  /** Recent AI mistakes the user corrected, already formatted for the prompt */
  corrections: string
  /** Notes about the user kept for the profile (see services/learned-notes) */
  learnedNotes?: string | null
}

/** How many transactions each step of the pipeline settled */
export interface CategorizedBySource {
  rule: number
  memory: number
  ai: number
}

/** Number of names offered to the LLM for consistency; past decisions carry the rest */
const MAX_NAMES_IN_PROMPT = 150

/** The remembered history for a transaction's merchant: the exact one, else a loose match */
function memoryEntryFor(
  memory: Map<string, MemoryEntry> | undefined,
  txn: PendingTransaction | undefined
): MemoryEntry | undefined {
  if (!memory || !txn) return undefined
  return (
    memory.get(`${txn.fingerprint}|${txn.type}`) ??
    lookupMemory(memory, txn.fingerprint, txn.type)?.entry
  )
}

/**
 * Country-specific categorization hints for the LLM
 * Includes common merchants, services, and patterns for each country
 */
const CATEGORY_HINTS: Record<CountryCode, string> = {
  IN: `CATEGORY DETECTION (India):

=== SALARY DETECTION - BE VERY CAREFUL ===
SALARY in India is ONLY paid via NEFT/RTGS/IMPS from employer, NEVER via UPI!
- SALARY = NEFT/RTGS credit with "SALARY" in description OR from known employer company name
- SALARY must be consistent monthly amount (same or very similar amount each month)
- UPI credits from individuals are NEVER salary (see TRANSFER RULES for what they are)
- Recurring UPI payments from same person are NOT salary, even if monthly
- Just because credits are regular/monthly does NOT make them salary

=== TRANSFER RULES - BE VERY CAREFUL ===
"transfer" is ONLY for money moving between the account holder's OWN accounts.
- transfer = "SELF", "OWN A/C", "TO SELF", transfer to/from the holder's own other bank account, wallet top-up (Paytm, Amazon Pay, PhonePe wallet load)
- Credit card bill payments = credit_card_payment (never transfer)
- Debits to OTHER people (person names via UPI/IMPS/NEFT) are NOT transfer. Use what the payment was for: landlord/rent = rent, present = gifts, shared meal = food_dining, house help/driver/cook = other. If the purpose is unclear = other
- Credits from OTHER people are NOT transfer. If the credit clearly pays back a shared expense (e.g. "dinner", "trip share", "split") use that expense category. Otherwise = other_income

=== REFUNDS & REVERSALS ===
- A refund, reversal, chargeback or failed-payment return (a credit) = the ORIGINAL merchant's category if it can be identified (Amazon/Flipkart refund = shopping, IRCTC/airline/MakeMyTrip refund = travel, Swiggy/Zomato refund = food_dining)
- If the merchant or purpose cannot be identified = refund
- NEVER use salary, other_income or cashback for refunds

=== CASHBACK & REWARDS ===
- Cashback, reward points credited, card or UPI rewards = cashback

=== SOFTWARE & SERVICES (software) ===
- AI tools: Claude AI, Anthropic, OpenAI, ChatGPT, Midjourney, Perplexity = software
- Cloud/Hosting: AWS, Google Cloud, Azure, Vercel, Netlify, Heroku, DigitalOcean, Render, Railway = software
- Domains/DNS: Namecheap, GoDaddy, Cloudflare, Google Domains = software
- Dev tools: GitHub, GitLab, JetBrains, Figma, Linear, Notion, Slack, Postman = software
- SaaS: Zoom, Dropbox, Google Workspace, Microsoft 365, Adobe, Canva, Grammarly = software
- VPN/Security: NordVPN, ExpressVPN, 1Password, LastPass, Bitwarden = software

=== PERSONAL CARE & FITNESS (personal_care) ===
- Gym, fitness: Cult.fit, Gold's Gym, fitness center, yoga studio = personal_care
- Salon, grooming: Naturals, Lakme, Urban Company, barber, haircut, spa = personal_care
- Wellness: massage, spa, beauty treatments = personal_care

=== GIFTS & FLOWERS (gifts) ===
- Flower delivery: FNP, Ferns N Petals, IGP, FlowerAura, Bloomsvilla = gifts
- Gift shops, gift cards, presents, occasion gifts = gifts

=== OTHER CATEGORIES ===
- NoBroker, Housing.com, 99acres, rent-related = rent
- Swiggy, Zomato, restaurant names, food delivery = food_dining
- BigBasket, Zepto, Blinkit, DMart, grocery stores = groceries
- Amazon, Flipkart, Myntra, Ajio, Meesho = shopping (unless clearly software/digital)
- Netflix, Spotify, Prime Video, Hotstar, JioCinema, YouTube Premium = entertainment
- CRED, credit card payments, card bill = credit_card_payment
- ATM, cash withdrawal, CWDR = atm_withdrawal
- Electricity, BESCOM, Tata Power, gas, water, piped gas = utilities
- Airtel, Jio, Vi, BSNL, broadband, Hathway, ACT = mobile_internet
- Uber, Ola, Rapido, metro, IRCTC, MakeMyTrip = travel
- Apollo, Practo, 1mg, Netmeds, hospital, clinic = healthcare
- Zerodha, Groww, Vested, mutual fund, SIP, stocks, broking = investment
- LIC, HDFC Life, ICICI Prudential, insurance premium = insurance
- Petrol, diesel, HP, BPCL, IOCL, fuel station = fuel
- School, college, Byju's, Unacademy, course fee = education
- EMI, loan payment, HDFC Ltd, Bajaj Finance = emi`,

  US: `CATEGORY DETECTION (USA):
- Large regular deposits (same amount bi-weekly/monthly) = paycheck (direct deposit, payroll)
- Rent payments, apartment, landlord, property management = rent
- Mortgage, home loan, Wells Fargo Mortgage, Chase Home = mortgage
- DoorDash, Uber Eats, Grubhub, restaurants = food_dining
- Whole Foods, Trader Joe's, Kroger, Walmart Grocery = groceries
- Amazon, Target, Walmart, Best Buy, Costco = shopping (unless clearly software/digital)
- Netflix, Spotify, HBO Max, Disney+, Hulu, Apple TV, YouTube Premium = entertainment
- Credit card payment, card services = credit_card_payment
- Venmo, Zelle, PayPal, Cash App with OTHER people are NOT transfer: debits = what the payment was for (rent, gifts, food_dining…) or other; credits = other_income unless they pay back a shared expense (then that expense's category)
- Moves between the holder's OWN accounts (own savings, own brokerage cash) = transfer
- ATM withdrawal, or cash back taken at a store checkout = atm_withdrawal
- Cashback or rewards credited by a card/bank = cashback
- Electric, gas, water, PG&E, ConEd, utility company = utilities
- Verizon, AT&T, T-Mobile, Comcast, Spectrum = phone_internet
- Uber, Lyft, airline, Delta, United, Amtrak = travel
- CVS, Walgreens, hospital, doctor, pharmacy = healthcare
- Fidelity, Schwab, Vanguard, 401k, IRA, brokerage = investment
- State Farm, Geico, Progressive, Allstate, insurance = insurance
- Shell, Chevron, ExxonMobil, gas station = gas
- Daycare, preschool, childcare, nanny = childcare
- Tuition, student loan, college, university = education
- Petco, PetSmart, vet, veterinary = pet

=== TRANSFER RULES - BE VERY CAREFUL ===
"transfer" is ONLY for money moving between the account holder's OWN accounts.
- transfer = money moved between the holder's own checking, savings and brokerage cash accounts (e.g. "Transfer to Savings", "Online transfer to Brokerage" for an account the holder owns)
- Credit card bill payments = credit_card_payment (never transfer)
- Debits to OTHER people (Zelle, Venmo, PayPal, Cash App) are NOT transfer. Use what the payment was for: landlord/rent = rent, present = gifts, shared dinner = food_dining. If the purpose is unclear = other
- Credits from OTHER people are NOT transfer. If the credit clearly pays back a shared expense (e.g. "dinner", "trip share", "split") use that expense category. Otherwise = other_income

=== REFUNDS & REVERSALS ===
- A refund, reversal, chargeback or failed-payment return (a credit) = the ORIGINAL merchant's category if it can be identified (Amazon refund = shopping, airline refund = travel, DoorDash refund = food_dining)
- If the merchant or purpose cannot be identified = refund
- NEVER use paycheck, other_income or cashback for refunds

=== SOFTWARE & SERVICES (software) ===
- AI tools: Claude AI, Anthropic, OpenAI, ChatGPT, Midjourney, Perplexity = software
- Cloud/Hosting: AWS, Google Cloud, Azure, Vercel, Netlify, Heroku, DigitalOcean, Render, Railway = software
- Domains/DNS: Namecheap, GoDaddy, Cloudflare, Google Domains = software
- Dev tools: GitHub, GitLab, JetBrains, Figma, Linear, Notion, Slack, Postman = software
- SaaS: Zoom, Dropbox, Google Workspace, Microsoft 365, Adobe, Canva, Grammarly = software
- VPN/Security: NordVPN, ExpressVPN, 1Password, LastPass, Bitwarden = software

=== PERSONAL CARE & FITNESS (personal_care) ===
- Gym, fitness: Planet Fitness, LA Fitness, Equinox, Orange Theory, yoga studio = personal_care
- Salon, grooming: Great Clips, Supercuts, salon, barber, haircut, spa = personal_care
- Wellness: massage, spa, beauty treatments = personal_care

=== GIFTS & FLOWERS (gifts) ===
- Flower delivery: 1-800-Flowers, ProFlowers, FTD, Teleflora = gifts
- Gift shops, gift cards, Hallmark, presents = gifts`,
}

/**
 * Account type specific hints to help LLM understand context
 */
const ACCOUNT_TYPE_HINTS: Record<string, string> = {
  credit_card: `CREDIT CARD STATEMENT CONTEXT:
- This is a CREDIT CARD statement, NOT a bank account
- Credits in credit card statements are typically: refunds, cashback, rewards, or PAYMENT RECEIVED (credit card bill payment)
- "PAYMENT RECEIVED" or "PAYMENT THANK YOU" = credit_card_payment (NOT salary!)
- Refund credits = the original merchant's category (or refund if unknown); cashback/reward credits = cashback
- Large credits are usually bill payments from bank account, NOT salary
- Debits are purchases/spending made using the credit card`,

  savings_account: `BANK ACCOUNT (SAVINGS) CONTEXT:
- This is a bank savings account statement
- Large regular credits (same amount monthly) are likely salary
- Debits to credit card companies = credit_card_payment
- UPI payments to other people are NOT transfer - categorize by what they were for (see TRANSFER RULES)
- Money moved to/from the account holder's OWN other accounts = transfer`,

  current_account: `BANK ACCOUNT (CURRENT) CONTEXT:
- This is a bank current/checking account statement
- Large regular credits may be salary or business income (business income = other_income)
- Debits to credit card companies = credit_card_payment
- Payments to/from other people or businesses are NOT transfer - only the holder's own accounts are transfer`,

  checking_account: `BANK ACCOUNT (CHECKING) CONTEXT:
- This is a bank checking account statement
- Large regular credits may be salary or business income (paycheck)
- Debits to credit card companies = credit_card_payment
- Payments to/from other people or businesses are NOT transfer - only the holder's own accounts are transfer`,
}

/**
 * Format the category list grouped by kind, for the LLM prompt
 */
export function formatCategoryList(categories: ReturnType<typeof getCategoriesForCountry>): string {
  const groups: { kind: CategoryKind; heading: string }[] = [
    { kind: 'income', heading: 'INCOME:' },
    { kind: 'expense', heading: 'EXPENSE:' },
    { kind: 'investment', heading: 'INVESTMENT:' },
    { kind: 'transfer', heading: "TRANSFER (only between the account holder's OWN accounts):" },
  ]

  return groups
    .map(({ kind, heading }) =>
      [
        heading,
        ...categories.filter((c) => c.kind === kind).map((c) => `${c.code}: ${c.label}`),
      ].join('\n')
    )
    .join('\n\n')
}

/**
 * Build profile context hint from profile summary
 * This helps the LLM understand the person's financial context
 */
function buildProfileContextHint(
  profileSummary?: string | null,
  learnedNotes?: string | null
): string {
  const notes = learnedNotes?.trim()
    ? `NOTES ABOUT THIS USER (learned from their data and edits):
${learnedNotes.trim()}
`
    : ''

  if (!profileSummary || profileSummary.trim().length === 0) {
    return notes
  }

  return `PROFILE CONTEXT (use this to improve categorization accuracy):
${profileSummary.trim()}

Apply this context when categorizing - e.g., if profile mentions "freelancer", irregular large credits may be freelance income (other_income); if "has rental property", regular credits from tenants are rental income (other_income); if "runs a business", business-related expenses should be identified. If a UPI/NEFT name matches the account holder's own name, it is a transfer between their own accounts.
${notes ? `\n${notes}` : ''}`
}

/**
 * Batch size for categorization - only batch if more than this many transactions
 * We want to send enough transactions together for pattern recognition (salary, recurring, etc.)
 * but not so many that it overwhelms the LLM's output capacity
 */
const BATCH_THRESHOLD = 250
const BATCH_SIZE = 250

/**
 * Maximum retry attempts for categorizing remaining uncategorized transactions
 */
const MAX_CATEGORIZATION_RETRIES = 5

/**
 * Fetch uncategorized transactions (where summary is null)
 * These are transactions that were inserted but not yet categorized by LLM
 */
async function fetchUncategorizedTransactions(
  transactionIds: string[]
): Promise<PendingTransaction[]> {
  if (transactionIds.length === 0) return []

  const rows = await db
    .select({
      id: tables.transactions.id,
      date: tables.transactions.date,
      amount: tables.transactions.amount,
      type: tables.transactions.type,
      description: tables.transactions.originalDescription,
      fingerprint: tables.transactions.merchantFingerprint,
    })
    .from(tables.transactions)
    .where(
      and(inArray(tables.transactions.id, transactionIds), isNull(tables.transactions.summary))
    )

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    amount: parseFloat(r.amount),
    type: r.type as 'credit' | 'debit',
    description: r.description || '',
    fingerprint: r.fingerprint || merchantFingerprint(r.description || ''),
  }))
}

/**
 * Update a single transaction's category in the database
 * Returns true if a row was updated, false if the ID didn't match any transaction
 */
async function updateTransactionCategory(cat: LabeledCategorization): Promise<boolean> {
  const now = dbType === 'postgres' ? new Date() : new Date().toISOString()

  // Ensure summary is never empty string - use a default if needed
  const summary = cat.summary?.trim() || 'Transaction'

  const result = await db
    .update(tables.transactions)
    .set({
      category: cat.category,
      categorySource: cat.categorySource,
      nameSource: cat.nameSource,
      categoryConfidence: cat.confidence.toString(),
      summary,
      nameVersion: NAME_VERSION,
      isSubscription: cat.isSubscription,
      updatedAt: now as Date,
    })
    .where(eq(tables.transactions.id, cat.id))
    .returning({ id: tables.transactions.id })

  if (result.length === 0) {
    logger.warn(`[Categorize] No transaction found with ID: ${cat.id}`)
    return false
  }
  return true
}

/**
 * Name and/or category forced by a rule on a transaction that still goes to the LLM
 */
interface RuleOverride {
  name?: string
  category?: string
}

/**
 * Names the user already has on transactions flagged as subscriptions
 */
async function fetchSubscriptionNames(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ name: tables.transactions.summary })
    .from(tables.transactions)
    .where(
      and(eq(tables.transactions.userId, userId), eq(tables.transactions.isSubscription, true))
    )
    .groupBy(tables.transactions.summary)

  return new Set(rows.map((r) => r.name).filter((n): n is string => !!n))
}

/**
 * Apply the user's rules to uncategorized transactions.
 * Transactions where rules set both name and category are saved directly (no LLM).
 * Transactions where a rule sets only one of them get an override that is applied to the LLM result.
 */
async function applyRules(
  userId: string,
  transactions: PendingTransaction[],
  validCategories: string[]
): Promise<{ savedIds: Set<string>; overrides: Map<string, RuleOverride> }> {
  const savedIds = new Set<string>()
  const overrides = new Map<string, RuleOverride>()

  const rules = await getRulesForUser(userId)
  if (rules.length === 0) return { savedIds, overrides }

  let subscriptionNames: Set<string> | undefined

  for (const txn of transactions) {
    const fields = resolveRuleFields(rules, {
      description: txn.description,
      type: txn.type,
      amount: txn.amount,
    })
    const name = fields.name
    const category =
      fields.category && validCategories.includes(fields.category) ? fields.category : undefined
    if (!name && !category) continue

    if (!name || !category) {
      overrides.set(txn.id, { name, category })
      continue
    }

    subscriptionNames ??= await fetchSubscriptionNames(userId)
    try {
      const saved = await updateTransactionCategory({
        id: txn.id,
        category,
        confidence: 1,
        summary: name,
        isSubscription: subscriptionNames.has(name),
        categorySource: 'rule',
        nameSource: 'rule',
      })
      if (saved) savedIds.add(txn.id)
    } catch (err) {
      logger.warn(`[Categorize] Failed to save rule match for transaction ${txn.id}:`, err)
    }
  }

  logger.debug(`[Categorize] Rules: ${savedIds.size} fully matched, ${overrides.size} partially`)
  return { savedIds, overrides }
}

/**
 * Answer transactions from the user's past decisions about the same merchant (no LLM).
 * A field a rule set on its own still wins over the remembered one.
 */
async function applyMemory(
  transactions: PendingTransaction[],
  memory: Map<string, MemoryEntry>,
  validCategories: string[],
  overrides: Map<string, RuleOverride>
): Promise<Set<string>> {
  const savedIds = new Set<string>()
  if (memory.size === 0) return savedIds

  for (const txn of transactions) {
    const resolved = lookupMemory(memory, txn.fingerprint, txn.type)?.resolved
    if (!resolved || !validCategories.includes(resolved.category)) continue

    const override = overrides.get(txn.id)
    try {
      const saved = await updateTransactionCategory({
        id: txn.id,
        category: override?.category ?? resolved.category,
        confidence: resolved.confidence,
        summary: override?.name ?? resolved.name,
        isSubscription: resolved.isSubscription,
        categorySource: override?.category ? 'rule' : 'memory',
        nameSource: override?.name ? 'rule' : 'memory',
      })
      if (saved) savedIds.add(txn.id)
    } catch (err) {
      logger.warn(`[Categorize] Failed to save memory match for transaction ${txn.id}:`, err)
    }
  }

  logger.debug(`[Categorize] Memory: ${savedIds.size} answered from past decisions`)
  return savedIds
}

/** Everything the categorization prompt is built from */
export interface CategorizationPromptInput {
  transactions: TransactionForCategorization[]
  categoryList: string
  countryCode: CountryCode
  accountType?: string
  profileSummary?: string | null
  userCategorizationHints?: string
  /** Section listing names already in use (see buildNamesInUseSection) */
  namesInUseSection?: string
  /** Leave out to build the prompt without past decisions, corrections and learned notes */
  learning?: LearningContext
}

/** Build the system and user prompt for one categorization batch (pure) */
export function buildCategorizationPrompt(input: CategorizationPromptInput): {
  systemPrompt: string
  prompt: string
} {
  const {
    transactions,
    categoryList,
    countryCode,
    accountType,
    profileSummary,
    userCategorizationHints,
    namesInUseSection = '',
    learning,
  } = input
  const txnList = transactions
    .map((t) => `${t.id},${t.date},${t.type},${t.amount},${quoteCSVField(t.description)}`)
    .join('\n')

  // Get country-specific hints
  const categoryHints = CATEGORY_HINTS[countryCode] || CATEGORY_HINTS.US
  const nameFormat = NAME_FORMAT[countryCode] || NAME_FORMAT.US

  // How the user handled similar merchants, and the AI answers they corrected
  const pastDecisions = learning
    ? formatPastDecisions(selectExamples(learning.memory, transactions))
    : ''
  const pastDecisionsSection = pastDecisions
    ? `YOUR PAST DECISIONS (follow these for the same merchant unless the description clearly says otherwise)
${pastDecisions}

`
    : ''
  const correctionsSection = learning?.corrections
    ? `YOUR CORRECTIONS (mistakes you made before that the user fixed)
${learning.corrections}

`
    : ''

  // Get account type specific hints
  const accountTypeHint = accountType ? ACCOUNT_TYPE_HINTS[accountType] || '' : ''

  // Get profile context from user-provided summary
  const profileContextHint = buildProfileContextHint(profileSummary, learning?.learnedNotes)

  // Build user-provided categorization hints section
  const userHintsSection = userCategorizationHints?.trim()
    ? `USER-PROVIDED CATEGORIZATION HINTS (IMPORTANT - apply these rules):
${userCategorizationHints.trim()}

`
    : ''

  const systemPrompt = `You are a transaction categorization engine. You ONLY output CSV data. You NEVER ask questions, provide explanations, or include any text other than CSV lines. Start outputting CSV immediately.`

  const prompt = `Categorize ALL ${transactions.length} transactions below. Output CSV ONLY - no explanations, no questions.
${userHintsSection}${profileContextHint ? `\n${profileContextHint}` : ''}${accountTypeHint ? `\n${accountTypeHint}\n` : ''}

TRANSACTIONS (id,date,type,amount,description):
${txnList}

CATEGORIES:

${categoryList}

OUTPUT FORMAT - CSV ONLY, one line per transaction:
id,category,confidence,name,is_subscription

RULES:
- Output EXACTLY ${transactions.length} CSV lines, one per transaction
- NO explanations, NO questions, NO commentary - ONLY CSV lines
- id: exact ID from input (copy exactly)
- category: code from categories list
- confidence: 0.0 to 1.0
- name: who is on the other side of the transaction, copied from the description.
  Follow NAME FORMAT below exactly. Never invent or guess.
- is_subscription: 1 if recurring subscription/service, 0 otherwise

SUBSCRIPTION DETECTION (is_subscription=1):
- Streaming: Netflix, Spotify, YouTube Premium, Prime Video, etc.
- Software/SaaS: Claude AI, ChatGPT, GitHub, Figma, Adobe, Notion, etc.
- Cloud/Hosting: AWS, Vercel, Netlify, Namecheap, domains, etc.
- Memberships: gym, premium services, recurring fees
- NOT one-time purchases, NOT salary, NOT rent, NOT utilities

${categoryHints}

${nameFormat}

${pastDecisionsSection}${correctionsSection}${namesInUseSection}START OUTPUT NOW:`

  return { systemPrompt, prompt }
}

/**
 * Process a single batch of transactions with streaming
 * Returns the number of successfully categorized transactions
 */
async function categorizeBatchStreaming(
  transactions: PendingTransaction[],
  validCategories: string[],
  categoryList: string,
  countryCode: CountryCode,
  llmClient: LLMClientResult,
  onCategorized: (cat: CategorizedTransaction) => Promise<void>,
  accountType?: string,
  profileSummary?: string | null,
  userCategorizationHints?: string,
  userId?: string,
  learning?: LearningContext
): Promise<{ success: number; failed: number }> {
  // Names already saved for this user (fetched per batch so names from earlier batches are included)
  const namesInUseSection = userId
    ? buildNamesInUseSection((await getNamesInUse(userId)).slice(0, MAX_NAMES_IN_PROMPT))
    : ''

  const { systemPrompt, prompt } = buildCategorizationPrompt({
    transactions,
    categoryList,
    countryCode,
    accountType,
    profileSummary,
    userCategorizationHints,
    namesInUseSection,
    learning,
  })

  let success = 0
  let failed = 0

  try {
    logger.debug(`[Categorize] Starting stream for ${transactions.length} transactions`)

    await streamCsvLines(
      llmClient,
      systemPrompt,
      prompt,
      async (line) => {
        const fields = parseCSVLine(line)
        const [id, category, confidenceStr, name, isSubStr] = fields
        if (fields.length < 5 || !id) {
          failed++
          return
        }

        const categoryCode = category?.toLowerCase().trim() || 'other'
        const finalCategory = validCategories.includes(categoryCode) ? categoryCode : 'other'
        const confidence = parseFloat(confidenceStr || '0.8')
        const isSubscription = isSubStr?.trim() === '1'

        try {
          await onCategorized({
            id: id.trim(),
            category: finalCategory,
            confidence: isNaN(confidence) ? 0.8 : Math.min(1, Math.max(0, confidence)),
            summary: name?.trim() || '',
            isSubscription,
          })
          success++
        } catch (err) {
          logger.warn(`[Categorize] Failed to save transaction ${id}:`, err)
          failed++
        }
      },
      LLM_TIMEOUT_MS.categorizeBatch
    )

    // Log if we didn't get all transactions
    const total = success + failed
    if (total < transactions.length) {
      logger.warn(
        `[Categorize] Stream ended early: got ${total}/${transactions.length} transactions`
      )
    }

    return { success, failed: failed + (transactions.length - total) }
  } catch (error) {
    logger.error(`[Categorize] Streaming error:`, error)
    return { success, failed: failed + (transactions.length - success - failed) }
  }
}

/**
 * Process a single categorization pass for given transactions
 * Returns the number of successfully categorized transactions
 */
async function runCategorizationPass(
  transactions: PendingTransaction[],
  countryCode: CountryCode,
  llmClient: LLMClientResult,
  onProgress?: (categorized: number, total: number) => void,
  progressOffset: number = 0,
  totalForProgress: number = 0,
  accountType?: string,
  profileSummary?: string | null,
  userCategorizationHints?: string,
  userId?: string,
  ruleOverrides?: Map<string, RuleOverride>,
  learning?: LearningContext
): Promise<{ success: number; failed: number }> {
  const categories = getCategoriesForCountry(countryCode)
  const categoryList = formatCategoryList(categories)
  const validCategories = categories.map((c) => c.code)

  // Only batch if we have more than threshold - we want all transactions together for pattern recognition
  const shouldBatch = transactions.length > BATCH_THRESHOLD

  if (shouldBatch) {
    logger.debug(
      `[Categorize] Large dataset (${transactions.length} transactions), batching into groups of ${BATCH_SIZE}`
    )
  } else {
    logger.debug(
      `[Categorize] Processing all ${transactions.length} transactions together for pattern recognition`
    )
  }

  // Split into batches only if needed
  const batches: PendingTransaction[][] = []
  if (shouldBatch) {
    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      batches.push(transactions.slice(i, i + BATCH_SIZE))
    }
  } else {
    batches.push(transactions) // Single batch with all transactions
  }

  const transactionsById = new Map(transactions.map((t) => [t.id, t]))
  let totalSuccess = 0
  let totalFailed = 0

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx]!

    if (shouldBatch) {
      logger.debug(
        `[Categorize] Processing batch ${batchIdx + 1}/${batches.length} (${batch.length} transactions)`
      )
    }

    const { success, failed } = await categorizeBatchStreaming(
      batch,
      validCategories,
      categoryList,
      countryCode,
      llmClient,
      async (cat) => {
        const override = ruleOverrides?.get(cat.id)
        // Check the AI's category against what the user did before (a rule's category needs no check)
        const txn = transactionsById.get(cat.id)
        const entry = memoryEntryFor(learning?.memory, txn)
        const confidence = override?.category
          ? cat.confidence
          : adjustConfidence(entry, cat.category, cat.confidence)
        const updated = await updateTransactionCategory({
          ...cat,
          confidence,
          category: override?.category ?? cat.category,
          summary: override?.name ?? cat.summary,
          categorySource: override?.category ? 'rule' : 'ai',
          nameSource: override?.name ? 'rule' : 'ai',
        })
        if (updated) {
          totalSuccess++

          // Log progress every 10 transactions
          if (totalSuccess % 10 === 0) {
            logger.debug(
              `[Categorize] Progress: ${progressOffset + totalSuccess}/${totalForProgress}`
            )
          }
          onProgress?.(progressOffset + totalSuccess, totalForProgress)
        }
      },
      accountType,
      profileSummary,
      userCategorizationHints,
      userId,
      learning
    )

    if (shouldBatch) {
      logger.debug(
        `[Categorize] Batch ${batchIdx + 1} complete: ${success} success, ${failed} failed`
      )
    } else {
      logger.debug(`[Categorize] Pass complete: ${success} success, ${failed} failed`)
    }

    totalFailed += failed
  }

  return { success: totalSuccess, failed: totalFailed }
}

async function loadLearning(userId: string): Promise<LearningContext> {
  const [memory, corrections] = await Promise.all([
    loadMemory(userId),
    loadRecentCorrections(userId),
  ])
  return { memory, corrections: formatCorrections(corrections) }
}

/**
 * Streaming categorization with real-time DB updates
 * Sends all transactions together for pattern recognition (salary, recurring payments, etc.)
 * Only batches if there are more than BATCH_THRESHOLD transactions
 *
 * Automatically retries for any transactions that weren't categorized (summary is null)
 * until all transactions are categorized or max retries reached.
 *
 * @param transactionIds - IDs of transactions to categorize
 * @param countryCode - Country code for category list
 * @param modelOverride - Optional model override
 * @param startFromIndex - Resume from this index if previous run failed (deprecated, kept for compatibility)
 * @param onProgress - Optional callback for progress updates
 * @param accountType - Optional account type for context (credit_card, savings_account, etc.)
 * @param profileSummary - Optional profile summary to provide context about the person (employer, income sources, etc.)
 * @param userCategorizationHints - Optional user-provided hints for categorization
 * @param userId - Optional user ID; when given, the user's rules, past decisions and existing transaction names are used
 * @param learning - What was learned from the user; loaded here when a userId is given and none is passed
 */
export async function categorizeTransactionsStreaming(
  transactionIds: string[],
  countryCode: CountryCode,
  modelOverride?: string,
  _startFromIndex: number = 0,
  onProgress?: (categorized: number, total: number) => void,
  accountType?: string,
  profileSummary?: string | null,
  userCategorizationHints?: string,
  userId?: string,
  learning?: LearningContext
): Promise<{
  categorizedCount: number
  failedAtIndex?: number
  categorizedBy: CategorizedBySource
}> {
  const categorizedBy: CategorizedBySource = { rule: 0, memory: 0, ai: 0 }
  if (transactionIds.length === 0) return { categorizedCount: 0, categorizedBy }

  const totalTransactions = transactionIds.length

  logger.debug(`[Categorize] Starting categorization for ${totalTransactions} transactions`)

  let totalCategorized = 0
  let retryCount = 0

  // Initial pass - fetch uncategorized transactions
  let uncategorized = await fetchUncategorizedTransactions(transactionIds)

  if (uncategorized.length === 0) {
    logger.debug(`[Categorize] All transactions already categorized`)
    return { categorizedCount: totalTransactions, categorizedBy }
  }

  logger.debug(`[Categorize] Found ${uncategorized.length} uncategorized transactions`)

  // Rules first, then the user's past decisions; only what is left goes to the LLM
  let ruleOverrides: Map<string, RuleOverride> | undefined
  if (userId) {
    learning ??= await loadLearning(userId)
    const validCategories = getCategoriesForCountry(countryCode).map((c) => c.code)
    const applied = await applyRules(userId, uncategorized, validCategories)
    ruleOverrides = applied.overrides
    categorizedBy.rule = applied.savedIds.size
    uncategorized = uncategorized.filter((t) => !applied.savedIds.has(t.id))

    const remembered = await applyMemory(
      uncategorized,
      learning.memory,
      validCategories,
      ruleOverrides
    )
    categorizedBy.memory = remembered.size
    uncategorized = uncategorized.filter((t) => !remembered.has(t.id))

    totalCategorized += categorizedBy.rule + categorizedBy.memory
    if (categorizedBy.rule + categorizedBy.memory > 0) {
      onProgress?.(totalCategorized, totalTransactions)
    }
  }

  if (uncategorized.length === 0) {
    return { categorizedCount: totalCategorized, categorizedBy }
  }

  const llmClient = await createLLMClientFromSettings(modelOverride, 'categorization')

  // Keep retrying until all transactions are categorized or max retries reached
  while (uncategorized.length > 0 && retryCount < MAX_CATEGORIZATION_RETRIES) {
    if (retryCount > 0) {
      logger.debug(
        `[Categorize] Retry ${retryCount}/${MAX_CATEGORIZATION_RETRIES}: ${uncategorized.length} transactions still need categorization`
      )
    }

    const { success } = await runCategorizationPass(
      uncategorized,
      countryCode,
      llmClient,
      onProgress,
      totalCategorized,
      totalTransactions,
      accountType,
      profileSummary,
      userCategorizationHints,
      userId,
      ruleOverrides,
      learning
    )

    totalCategorized += success
    categorizedBy.ai += success

    // Check if any transactions are still uncategorized (summary is null)
    uncategorized = await fetchUncategorizedTransactions(transactionIds)

    if (uncategorized.length === 0) {
      logger.debug(`[Categorize] All ${totalTransactions} transactions successfully categorized`)
      break
    }

    retryCount++
  }

  // Final status
  if (uncategorized.length > 0) {
    logger.warn(
      `[Categorize] After ${retryCount} retries, ${uncategorized.length} transactions still uncategorized`
    )
  }

  logger.debug(`[Categorize] Streaming complete: ${totalCategorized} transactions categorized`)

  return {
    categorizedCount: totalCategorized,
    failedAtIndex: uncategorized.length > 0 ? totalCategorized : undefined,
    categorizedBy,
  }
}

/**
 * Categorize all transactions for given statement IDs
 * Fetches transactions from DB and categorizes them together for better pattern recognition
 *
 * @param statementIds - Statement IDs to categorize transactions for
 * @param countryCode - Country code for category list
 * @param categorizationModel - Model to use for categorization
 * @param onProgress - Optional progress callback
 * @param profileId - Optional profile ID to fetch profile summary for context
 * @param userCategorizationHints - Optional user-provided hints for categorization
 */
export async function categorizeStatements(
  statementIds: string[],
  countryCode: CountryCode,
  categorizationModel?: string,
  onProgress?: (categorized: number, total: number) => void,
  profileId?: string,
  userCategorizationHints?: string
): Promise<{ categorizedCount: number; totalCount: number; categorizedBy: CategorizedBySource }> {
  const categorizedBy: CategorizedBySource = { rule: 0, memory: 0, ai: 0 }
  if (statementIds.length === 0) {
    return { categorizedCount: 0, totalCount: 0, categorizedBy }
  }

  logger.debug(`[Categorize] Categorizing transactions for ${statementIds.length} statements`)

  // Fetch all transactions for these statements
  const transactions = await db
    .select({
      id: tables.transactions.id,
      accountId: tables.transactions.accountId,
      userId: tables.transactions.userId,
    })
    .from(tables.transactions)
    .where(inArray(tables.transactions.statementId, statementIds))

  if (transactions.length === 0) {
    logger.debug(`[Categorize] No transactions found for statements`)
    return { categorizedCount: 0, totalCount: 0, categorizedBy }
  }

  logger.debug(`[Categorize] Found ${transactions.length} transactions to categorize`)

  // Account type and saved hints differ per account, so each account is categorized on its own
  const accountIds = [...new Set(transactions.map((t) => t.accountId).filter(Boolean))] as string[]
  const accountsById = new Map<string, { type: string; categorizationHints: string | null }>()

  if (accountIds.length > 0) {
    const accounts = await db
      .select({
        id: tables.accounts.id,
        type: tables.accounts.type,
        categorizationHints: tables.accounts.categorizationHints,
      })
      .from(tables.accounts)
      .where(inArray(tables.accounts.id, accountIds))

    for (const account of accounts) accountsById.set(account.id, account)
  }

  const groups = new Map<string, typeof transactions>()
  for (const t of transactions) {
    const key = t.accountId ?? ''
    groups.set(key, [...(groups.get(key) ?? []), t])
  }

  // Fetch profile summary for context if profileId is provided
  let profileSummary: string | null = null
  let learnedNotes: string | null = null
  if (profileId) {
    const [profile] = await db
      .select({ summary: tables.profiles.summary, learnedNotes: tables.profiles.learnedNotes })
      .from(tables.profiles)
      .where(eq(tables.profiles.id, profileId))
      .limit(1)

    profileSummary = profile?.summary ?? null
    learnedNotes = profile?.learnedNotes ?? null
    if (profileSummary) {
      logger.debug(`[Categorize] Using profile summary for context`)
    }
  }

  // What was learned from the user is the same for every account, so it is loaded once
  const userId = transactions[0]!.userId
  const learning = { ...(await loadLearning(userId)), learnedNotes }

  let categorizedCount = 0
  let processed = 0

  for (const group of groups.values()) {
    const [first] = group
    if (!first) continue
    const account = first.accountId ? accountsById.get(first.accountId) : undefined
    // Hints given for this run are prefilled from the account's saved hints by the UI, so they
    // already include them; fall back to the saved hints only when none were given
    const hints =
      userCategorizationHints?.trim() || account?.categorizationHints?.trim() || undefined
    const offset = processed

    const result = await categorizeTransactionsStreaming(
      group.map((t) => t.id),
      countryCode,
      categorizationModel,
      0,
      onProgress && ((done) => onProgress(offset + done, transactions.length)),
      account?.type,
      profileSummary,
      hints,
      first.userId,
      learning
    )

    categorizedBy.rule += result.categorizedBy.rule
    categorizedBy.memory += result.categorizedBy.memory
    categorizedBy.ai += result.categorizedBy.ai
    categorizedCount += result.categorizedCount
    processed += group.length
  }

  logger.debug(
    `[Categorize] Completed: ${categorizedCount}/${transactions.length} transactions categorized`
  )

  return {
    categorizedCount,
    totalCount: transactions.length,
    categorizedBy,
  }
}
