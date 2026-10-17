/**
 * Transaction name rules shared by the categorizer and the one-time rename.
 * The name is stored in the transaction's `summary` column; `name_version` = 1 marks rows
 * written under these rules.
 */

import { and, desc, eq, sql } from 'drizzle-orm'
import { db, tables } from '../../db'
import type { CountryCode } from '../constants'
import { parseCSVLine } from './csv'

/** Value of `transactions.name_version` for names written under the current rules */
export const NAME_VERSION = 1

/** Maximum number of existing names sent to the LLM per batch */
export const MAX_NAMES_IN_USE = 300

const NAME_FORMAT_COMMON = `NAME FORMAT - CRITICAL
The name is the transaction's title. It is also used to group transactions, so the same
merchant or person must get the same name every time. The category and the direction
(money in or out) are shown separately, so the name NEVER describes the transaction.
Never add words like "payment", "purchase", "order", "salary", "transfer", "sent",
"received" or "subscription" to a name.

COPY, NEVER INVENT - THE MOST IMPORTANT RULE
- Take the name ONLY from words that are written in the description.
- NEVER guess, infer, imagine or add any name, brand, word or meaning that is not
  written in the description. Do not use your own knowledge to replace a company or
  person with a brand you think it belongs to.
- The ONLY changes allowed are:
  1. changing capital letters
  2. adding spaces between words that are joined together
  3. removing the noise listed under HOW TO WRITE IT
- Copy every word letter by letter. NEVER correct a spelling, even when you think it is
  wrong or you know the real spelling: "SESHASAYEE" stays Seshasayee (never Seshashayee),
  "SPOTIIFY" stays Spotiify (never Spotify).
- NEVER complete a word the bank cut short: "RESTAUR" stays Restaur (never Restaurant),
  "HOSPITA" stays Hospita, "SOLUTI" stays Soluti.
- Use ONLY this transaction's own description. NEVER take a name from another transaction,
  even one that looks related (same reference number, same amount, same date or account).
  If this description has no name, follow NO NAME IN THE DESCRIPTION below.
- Before writing each name, check it letter by letter against the description: every
  letter of the name must appear there in the same order.
`

function fixedLabels(
  taxLabel: string,
  taxMeaning: string,
  chargesMeaning: string,
  appExample: string,
  depositLabel: string,
  depositMeaning: string
): string {
  return `- Interest Received      interest paid to the account holder
- Interest Charged       interest charged on a card or loan
- Bank Charges           ${chargesMeaning}
- ${taxLabel.padEnd(23)}${taxMeaning}
- Cash Withdrawal        ATM or cash withdrawal
- Cash Deposit           cash deposited
- ${depositLabel.padEnd(23)}${depositMeaning}
- Credit Card Payment    paying a credit card bill. If an app is named (${appExample}),
                         use the app's name instead.
- Payment Received       a payment credited on a credit card statement
- Cashback               only when no merchant or bank is named; otherwise use that name
- Refund                 only when no merchant is named; otherwise use the merchant`
}

/** What to write when the description names no merchant or person */
function noNameRules(examples: string): string {
  return `NO NAME IN THE DESCRIPTION - never output "Unidentified", "Unknown" or an empty name
1. If one of the FIXED LABELS fits, use it.
2. Otherwise build the name ONLY from words that are in the description: keep the
   payment-method words and bank names, drop numbers, dates and codes that mix letters
   and digits. Title Case, at most 5 words.
${examples}`
}

const FIXED_LABELS_IN = fixedLabels(
  'Tax Deducted',
  'TDS',
  'fees, charges, annual or membership fees, GST on charges',
  'e.g. CRED',
  'Fixed Deposit',
  'money moved into, or paid out of, a fixed deposit (FD)'
)

const FIXED_LABELS_US = fixedLabels(
  'Tax Withheld',
  'tax withheld at source',
  'fees, charges, annual or membership fees, overdraft fees',
  'e.g. Bilt',
  'Certificate Of Deposit',
  'money moved into, or paid out of, a certificate of deposit (CD)'
)

/**
 * Country-specific name rules and examples for the LLM
 */
export const NAME_FORMAT: Record<CountryCode, string> = {
  IN: `${NAME_FORMAT_COMMON}
WHERE THE NAME IS IN INDIAN BANK DESCRIPTIONS
- UPI: "UPI/P2A/<ref>/<NAME>/<BANK>/..." or "UPI/P2M/<ref>/<NAME>/..."
  → the part right after the reference number
- Card: "<MERCHANT>,<CITY> <TYPE>" → the part before the comma
- ACH / NACH: "ACH-DR-<COMPANY>-<ref>" → the company
- NEFT / RTGS / IMPS / IFT: the sender or receiver name in the description
- POS: "POS <card number> <MERCHANT> <CITY>" → the merchant

HOW TO WRITE IT
1. Title Case (capitalise each word). Keep short forms in capitals: IRCTC, LIC, BESCOM.
2. Remove this noise: legal words (Private Limited, Pvt Ltd, Ltd, Limited, LLP, Inc),
   city names, reference numbers, card and account numbers, UPI handles (@ybl, @okaxis),
   bank codes (e.g. UTIB0001234), the other person's bank name in UPI lines, and
   payment-method words (UPI, NEFT, IMPS, RTGS, ACH, NACH, POS, INB, IFT, P2A, P2M).
3. Keep every remaining word of the name. At most 5 words.
4. People: the full name exactly as written, in Title Case. Never shorten it to a first name.
5. No commas, quotes or emojis.

FIXED LABELS - use exactly these when no merchant or person is named
${FIXED_LABELS_IN}

${noNameRules(`   "IMPS/P2A/123456789012//X123456/AXB/" → IMPS AXB
   "UPI/P2A/123456789012/123456789012345/090826/State Bank Of In" → UPI State Bank Of In`)}

EXAMPLES (description → name)
- "SWIGGY,BENGALURU RESTAURANTS" → Swiggy
- "YOUTUBEGOOGLE,MUMBAI MISC STORE" → YouTube Google
- "ACH-DR-ZERODHA BROKING LTD-ABC123XYZ-UTIB0001" → Zerodha Broking
- "INB/IFT/ACME TECHNOLOGIES PRIVATE LIMITED/TPARTY TRA" → Acme Technologies
- "UPI/P2M/123456789012/BIG BAZAAR/HDFC BANK/..." → Big Bazaar
- "UPI/P2A/123456789012/RAHUL SHARMA/HDFC BANK/..." → Rahul Sharma
- "NACH-DR-LIC OF INDIA-12345" → LIC Of India
- "UPI/P2M/123456789012/BESCOM/..." → BESCOM
- "SB:XXXXXXXXXXXX:Int.Pd:01-07-2026 to 30-09-2026" → Interest Received
- "GST ON CHARGES" → Bank Charges
- "ATM-CASH/XYZ/BANGALORE/1234" → Cash Withdrawal
- "CRD-PMNT-411111****1234" → Credit Card Payment
- "TRF TO FD no. XXXXXXXXXXXX" → Fixed Deposit
- "ACME RESTAUR SOUTH DELHI" → Acme Restaur
- "IMPS/P2A/123456789012//X123456/AXB/" → IMPS AXB`,

  US: `${NAME_FORMAT_COMMON}
WHERE THE NAME IS IN US BANK DESCRIPTIONS
- Card / POS: "POS PURCHASE <MERCHANT> <CITY> <STATE>" or "<MERCHANT> #<store number>"
  → the merchant
- Zelle / Venmo / Cash App: "ZELLE PAYMENT TO <NAME>", "VENMO PAYMENT <NAME>" → the person
- ACH: "ACH DEBIT <COMPANY> <ref>" or "<COMPANY> DES:<type> ID:<ref>" → the company
- Wire / online transfer: the sender or receiver name in the description
- Checks: "CHECK #1234" → the payee if one is written, otherwise follow NO NAME IN THE DESCRIPTION

HOW TO WRITE IT
1. Title Case (capitalise each word). Keep short forms in capitals: AT&T, IKEA, USPS.
2. Remove this noise: legal words (Inc, LLC, Corp, Co, Ltd), city and state names, store
   numbers, reference numbers, check numbers, card and account numbers, and payment-method
   words (POS, ACH, DES, ID, PPD, WEB, DEBIT, CREDIT, ZELLE, VENMO, WIRE, ONLINE).
3. Keep every remaining word of the name. At most 5 words.
4. People: the full name exactly as written, in Title Case. Never shorten it to a first name.
5. No commas, quotes or emojis.

FIXED LABELS - use exactly these when no merchant or person is named
${FIXED_LABELS_US}

${noNameRules(`   "CHECK #1042" → Check
   "ONLINE TRANSFER REF #IB0123456789" → Online Transfer`)}

EXAMPLES (description → name)
- "STARBUCKS #12345 SEATTLE WA" → Starbucks
- "AMZN MKTP US*1A2B3C4D5" → Amzn Mktp US
- "ZELLE PAYMENT TO JANE DOE" → Jane Doe
- "VENMO PAYMENT JOHN SMITH 123456" → John Smith
- "ACH DEBIT COMCAST CABLE 0123456789" → Comcast Cable
- "ACME CORP DES:PAYROLL ID:123456" → Acme
- "POS PURCHASE TARGET T-1234 AUSTIN TX" → Target
- "CHECK #1042" → Check
- "INTEREST PAID THIS PERIOD" → Interest Received
- "MONTHLY MAINTENANCE FEE" → Bank Charges
- "ATM WITHDRAWAL 123 MAIN ST" → Cash Withdrawal
- "PAYMENT THANK YOU" → Payment Received
- "TRANSFER TO CD 0012345" → Certificate Of Deposit
- "ACME RESTAUR AUSTIN TX" → Acme Restaur`,
}

/**
 * Build the "names already in use" prompt section. Empty when there are no names.
 */
export function buildNamesInUseSection(names: string[]): string {
  const list = names
    .map((n) => n.trim())
    .filter((n) => n.length > 0 && !n.includes(',') && !n.includes('\n'))
    .slice(0, MAX_NAMES_IN_USE)
  if (list.length === 0) return ''

  return `NAMES ALREADY IN USE
Use a name from this list ONLY when that same name is written in the description
(ignoring capitals, spaces and noise). Never pick a name from this list because it looks
similar or because you think it is the same business. If nothing matches, write a new
name following the rules above.
${list.join(', ')}

`
}

/**
 * Distinct names already saved for this user under the current rules, most used first
 */
export async function getNamesInUse(userId: string): Promise<string[]> {
  const rows = await db
    .select({ name: tables.transactions.summary })
    .from(tables.transactions)
    .where(
      and(
        eq(tables.transactions.userId, userId),
        eq(tables.transactions.nameVersion, NAME_VERSION),
        sql`${tables.transactions.summary} IS NOT NULL`
      )
    )
    .groupBy(tables.transactions.summary)
    .orderBy(desc(sql`count(*)`))
    .limit(MAX_NAMES_IN_USE)

  return rows.map((r) => r.name).filter((n): n is string => !!n)
}

/**
 * Parse one `id,name` line of the name-only response. Returns null when it is unusable.
 */
export function parseNameLine(line: string): { id: string; name: string } | null {
  const fields = parseCSVLine(line)
  if (fields.length < 2) return null
  const id = fields[0]?.trim()
  const name = fields.slice(1).join(' ').trim()
  if (!id || !name) return null
  return { id, name }
}
