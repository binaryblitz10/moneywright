/**
 * Merchant fingerprint: a short, stable key for "who this transaction is with", so a correction
 * made on one transaction can be reused for every other transaction of the same merchant.
 * Reference numbers, dates and payment-channel words are dropped, so the same merchant gives the
 * same key across statements. Pure functions, no I/O.
 */

import { FILLER_WORDS } from './text-filler'

/** Bump when the rules below change: stored fingerprints are then recomputed at startup */
export const FINGERPRINT_VERSION = 3

/** A UPI id with this many digits or more in its local part is a generated QR / terminal id */
const MAX_UPI_LOCAL_DIGITS = 5
/** A token with this many digits or more is a reference number or card fragment; bare numbers (day, month) are dropped too */
const MIN_REFERENCE_DIGITS = 4
const MAX_FINGERPRINT_WORDS = 3

const UPI_ID = /([a-z0-9._]+)@([a-z][a-z0-9]*)/

/** Payment-channel and banking words that appear on lines of many unrelated merchants */
const CHANNEL_WORDS = new Set([
  'pos',
  'ach',
  'nach',
  'dr',
  'cr',
  'debit',
  'credit',
  'card',
  'payment',
  'purchase',
  'transfer',
  'to',
  'from',
  'by',
  'via',
  'at',
  'for',
  'mb',
  'ib',
  'ecom',
  'inb',
  'net',
  'banking',
  'mmt',
  'upi',
  'imps',
  'neft',
  'rtgs',
  'atm',
  'cash',
  'withdrawal',
  'web',
  'online',
  'recurring',
  'pmt',
  'trf',
  'tfr',
  'ft',
  'id',
  'no',
])

/** Payment gateways that prefix the real merchant (`Paytm*UBER`, `PAYU*SWIGGY`) */
const GATEWAY_WORDS = new Set(['paytm', 'payu', 'billdesk', 'ccavenue', 'cashfree', 'pg'])

/**
 * Places printed after the merchant name: the same merchant in another city is still the same merchant.
 * Two-word places (`new delhi`, `new york`) are removed as phrases before splitting, so a lone "new" survives.
 */
const PLACE_PHRASES = /\b(?:new delhi|new york|san francisco|los angeles)\b/gu
const PLACE_WORDS = new Set([
  'delhi',
  'mumbai',
  'bombay',
  'bangalore',
  'bengaluru',
  'noida',
  'gurgaon',
  'gurugram',
  'ghaziabad',
  'faridabad',
  'chennai',
  'hyderabad',
  'secunderabad',
  'pune',
  'kolkata',
  'ahmedabad',
  'jaipur',
  'lucknow',
  'chandigarh',
  'kochi',
  'goa',
  'india',
  'ind',
  'usa',
  'us',
  'ny',
  'nyc',
  'ca',
  'tx',
  'wa',
])

/** Fingerprint of a transaction description, or '' when nothing identifies the merchant */
export function merchantFingerprint(description: string): string {
  const text = description.toLowerCase()

  const upi = UPI_ID.exec(text)
  if (upi) {
    const digits = (upi[1]!.match(/\d/g) ?? []).length
    if (digits <= MAX_UPI_LOCAL_DIGITS) return `upi:${upi[1]}@${upi[2]}`
  }

  const words = text
    .replace(PLACE_PHRASES, ' ')
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((token) => token.length > 1 && !/^\d+$/u.test(token))
    .filter((token) => (token.match(/\d/g) ?? []).length < MIN_REFERENCE_DIGITS)
    // Order codes mix letters with several digits (`2K4AB1`); names rarely do (`7eleven`)
    .filter((token) => !(/\p{L}/u.test(token) && (token.match(/\d/g) ?? []).length >= 2))
    .filter((token) => !FILLER_WORDS.has(token) && !CHANNEL_WORDS.has(token))
    .filter((token) => !GATEWAY_WORDS.has(token) && !PLACE_WORDS.has(token))

  return words.slice(0, MAX_FINGERPRINT_WORDS).join(' ')
}
