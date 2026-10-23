/**
 * Rule-based parsing of bank / card transaction alerts. Pure functions, no AI and no I/O,
 * so the same text always gives the same result and nothing leaves the machine.
 */

export interface ParsedSms {
  /** The transaction date stated in the text (YYYY-MM-DD), when it has one */
  date: string | null
  amount: number | null
  currency: string | null
  type: 'credit' | 'debit' | null
  last4: string | null
  merchant: string | null
}

/** Everything needed to create a transaction from a message */
export interface CompleteSms {
  amount: number
  currency: string
  type: 'credit' | 'debit'
  last4: string
  merchant: string
}

const CURRENCY_CODES =
  'INR|USD|EUR|GBP|AED|SGD|AUD|CAD|JPY|CHF|HKD|CNY|THB|MYR|SAR|QAR|KWD|BHD|OMR|NZD|ZAR|IDR|PHP|LKR|NPR'

const SYMBOL_CURRENCY: Record<string, string> = {
  rs: 'INR',
  '₹': 'INR',
  $: 'USD',
  us$: 'USD',
  '€': 'EUR',
  '£': 'GBP',
}

const AMOUNT_VALUE = '(\\d+(?:,\\d+)*(?:\\.\\d{1,2})?)'
const CURRENCY_TOKEN = `(${CURRENCY_CODES}|rs\\.?|₹|us\\$|\\$|€|£)`
const CURRENCY_FIRST = new RegExp(`${CURRENCY_TOKEN}\\s*${AMOUNT_VALUE}`, 'gi')
const CURRENCY_LAST = new RegExp(`${AMOUNT_VALUE}\\s*(${CURRENCY_CODES})\\b`, 'gi')

/** Amounts that describe the card, not the transaction */
const BALANCE_CONTEXT = /(avl|avail|available|limit|bal|balance|outstanding|due|min)\W*$/i

const DEBIT_WORDS = /\b(spent|debit|debited|purchase|purchased|paid|withdrawn|charged|used)\b/i
const CREDIT_WORDS = /\b(credited|refund|refunded|reversal|reversed|received|cashback)\b/i
/** Statement and due-date notices mention money but are not transactions */
const REMINDER_WORDS =
  /\b(?:is|are) due\b|\bdue (?:by|on|date)\b|\bminimum (?:amount )?due\b|\bstatement\b.*\b(?:generated|ready|available)\b/i
/** "Payment of Rs. 765.82 has been received": a biller thanking you, or a card bill payment */
const PAYMENT_RECEIVED = /\bpayment\b.*\breceived\b/i
const OTP_WORDS = /\b(otp|one[- ]?time (?:password|pin)|verification code)\b/i

function toCurrency(token: string): string {
  const key = token.toLowerCase().replace(/\.$/, '')
  return SYMBOL_CURRENCY[key] ?? token.toUpperCase()
}

function parseAmountText(value: string): number | null {
  const amount = Number(value.replace(/,/g, ''))
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

function findAmount(text: string): { amount: number; currency: string } | null {
  const hits: Array<{ index: number; amount: number; currency: string }> = []

  for (const m of text.matchAll(CURRENCY_FIRST)) {
    const amount = parseAmountText(m[2]!)
    if (amount !== null) hits.push({ index: m.index!, amount, currency: toCurrency(m[1]!) })
  }
  for (const m of text.matchAll(CURRENCY_LAST)) {
    const amount = parseAmountText(m[1]!)
    if (amount !== null) hits.push({ index: m.index!, amount, currency: toCurrency(m[2]!) })
  }

  hits.sort((a, b) => a.index - b.index)
  const hit = hits.find(
    (h) => !BALANCE_CONTEXT.test(text.slice(Math.max(0, h.index - 25), h.index))
  )
  return hit ? { amount: hit.amount, currency: hit.currency } : null
}

const LAST4_PATTERNS = [
  /\b(?:ending(?:\s+(?:with|in))?|card(?:\s+no\.?)?|a\/c(?:\s+no\.?)?|acct|account)\s*[:-]?\s*(?:[xX*•.]+\s*)?(\d{4,5})\b/i,
  /[xX*•]{2,}\s?(\d{4,5})\b/,
]

function findLast4(text: string): string | null {
  for (const pattern of LAST4_PATTERNS) {
    const m = text.match(pattern)
    if (m) return m[1]!.slice(-4)
  }
  return null
}

function findType(text: string): 'credit' | 'debit' | null {
  if (CREDIT_WORDS.test(text) && !DEBIT_WORDS.test(text)) return 'credit'
  if (DEBIT_WORDS.test(text) && !CREDIT_WORDS.test(text)) return 'debit'
  return null
}

const MERCHANT_STOP =
  '(?:\\s+(?:on|for|using|via|with|ref|txn|avl|avail|available|limit|if|not|from|dated|at)\\b|[.,;(]|\\s+-\\s|$)'
const MERCHANT_PATTERNS = [
  // UPI/IMPS/NEFT narration, kept whole (UPI/P2A/665930217593/YASH SINGH): the type and the
  // reference tell the categorizer it is a payment to a person
  /\b((?:UPI|IMPS|NEFT|RTGS)\/[A-Za-z0-9]+\/\d+\/[^\n/]+?)(?=\s+(?:WhatsApp|Not you|SMS|Call|Avl)\b|\n|$)/i,
  // Bank narration after the time: "15-10-26 07:10:44 CRD-PMNT-411146****2783 WhatsApp BAL to ..."
  /\d{1,2}:\d{2}:\d{2}\s+([A-Za-z0-9][^\n]*?)\s+(?:WhatsApp|Not you|SMS|Call|Avl)\b/i,
  // "INR 139.00 for Spotify India Pvt Ltd has been charged to your card"
  /\bfor\s+(.+?)\s+has been (?:charged|debited)\b/i,
  new RegExp(`\\binfo\\s*[:\\-]\\s*(.+?)${MERCHANT_STOP}`, 'i'),
  new RegExp(`\\b(?:at|@)\\s+(?!card\\b)([A-Za-z0-9][A-Za-z0-9&'*_./\\- ]*?)${MERCHANT_STOP}`, 'i'),
  new RegExp(`\\btowards\\s+([A-Za-z0-9][A-Za-z0-9&'*_./\\- ]*?)${MERCHANT_STOP}`, 'i'),
]

function findMerchant(text: string): string | null {
  for (const pattern of MERCHANT_PATTERNS) {
    const m = text.match(pattern)
    const merchant = m?.[1]?.replace(/\s+/g, ' ').trim()
    if (merchant && merchant.length >= 2 && !/^\d+$/.test(merchant)) return merchant
  }
  // Card bill payments have no merchant
  if (PAYMENT_RECEIVED.test(text)) return 'Payment received'
  return null
}

/**
 * Whether a message reads like a card / bank transaction alert: it has an amount and says money
 * moved, and it is not an OTP. Only such messages are ever stored or sent for AI parsing.
 * A "payment received" notice that names no card or account is a biller's receipt for a payment
 * made elsewhere (a bill paid by card), not a transaction on one of the user's accounts.
 */
export function looksLikeTransaction(text: string): boolean {
  if (OTP_WORDS.test(text) || REMINDER_WORDS.test(text)) return false
  if (PAYMENT_RECEIVED.test(text) && !findLast4(text)) return false
  if (!findAmount(text)) return false
  return DEBIT_WORDS.test(text) || CREDIT_WORDS.test(text)
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// 20-10-26, 08/10/2026 (day first)
const NUMERIC_DATE = /(?<![\d,.])(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/
// 19 October 2026, 21-Oct-26
const NAMED_DATE = /(?<!\d)(\d{1,2})[-\s]+([A-Za-z]{3,9})[-\s,]+(\d{4}|\d{2})(?!\d)/

function toIsoDate(day: number, month: number, year: number): string | null {
  const fullYear = year < 100 ? 2000 + year : year
  const date = new Date(Date.UTC(fullYear, month - 1, day))
  if (
    date.getUTCFullYear() !== fullYear ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return date.toISOString().slice(0, 10)
}

/** The first date the text states, read day-first as Indian bank alerts write it */
export function parseMessageDate(text: string): string | null {
  const numeric = text.match(NUMERIC_DATE)
  if (numeric) {
    const date = toIsoDate(Number(numeric[1]), Number(numeric[2]), Number(numeric[3]))
    if (date) return date
  }
  const named = text.match(NAMED_DATE)
  if (named) {
    const month = MONTHS.indexOf(named[2]!.slice(0, 3).toLowerCase()) + 1
    if (month > 0) return toIsoDate(Number(named[1]), month, Number(named[3]))
  }
  return null
}

/** Pull out whatever fields the text states; missing fields are null */
export function parseSms(text: string): ParsedSms {
  const amount = findAmount(text)
  return {
    date: parseMessageDate(text),
    amount: amount?.amount ?? null,
    currency: amount?.currency ?? null,
    type: findType(text),
    last4: findLast4(text),
    merchant: findMerchant(text),
  }
}

/** The parsed fields as a complete record, or null when any of them is missing */
export function toCompleteSms(parsed: ParsedSms): CompleteSms | null {
  const { amount, currency, type, last4, merchant } = parsed
  if (amount === null || !currency || !type || !last4 || !merchant) return null
  return { amount, currency, type, last4, merchant }
}
