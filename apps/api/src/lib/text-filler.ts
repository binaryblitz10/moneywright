/**
 * Gateway, bank and company-suffix words that say nothing about which merchant a text names.
 * Shared by the bank alert matcher and the merchant fingerprint. Pure data, no I/O.
 */

export const FILLER_WORDS = new Set<string>([
  'razorpay',
  'raz',
  'upi',
  'imps',
  'neft',
  'rtgs',
  'p2a',
  'p2m',
  'pvt',
  'ltd',
  'limited',
  'private',
  'india',
  'bank',
  'ref',
  'txn',
  'www',
  'com',
  'the',
  'and',
  'int',
  'inc',
])
