import { describe, expect, test } from 'bun:test'
import {
  transactionAmountSchema,
  transactionCategorySchema,
  transactionDateSchema,
  transactionTypeSchema,
} from './transaction-input'
import { MANUAL_DOCUMENT_TYPE, isManualStatement } from './manual-statement'

describe('transactionDateSchema', () => {
  test('accepts real dates', () => {
    expect(transactionDateSchema.safeParse('2026-02-28').success).toBe(true)
    expect(transactionDateSchema.safeParse('2024-02-29').success).toBe(true)
  })

  test('rejects impossible or malformed dates', () => {
    for (const bad of [
      '2026-02-30',
      '2026-13-01',
      '2026-2-3',
      '03/02/2026',
      '',
      '2026-02-28T00:00',
    ]) {
      expect(transactionDateSchema.safeParse(bad).success).toBe(false)
    }
  })
})

describe('transactionAmountSchema', () => {
  test('accepts positive amounts with up to 2 decimals', () => {
    for (const ok of [1, 0.01, 10.5, 1234.56, 33247.9, 1.1]) {
      expect(transactionAmountSchema.safeParse(ok).success).toBe(true)
    }
  })

  test('rejects zero, negatives, extra decimals and non-finite values', () => {
    for (const bad of [0, -5, 1.234, 0.001, Infinity, NaN]) {
      expect(transactionAmountSchema.safeParse(bad).success).toBe(false)
    }
    expect(transactionAmountSchema.safeParse('12').success).toBe(false)
  })
})

describe('transactionTypeSchema / transactionCategorySchema', () => {
  test('type is credit or debit only', () => {
    expect(transactionTypeSchema.safeParse('credit').success).toBe(true)
    expect(transactionTypeSchema.safeParse('debit').success).toBe(true)
    expect(transactionTypeSchema.safeParse('refund').success).toBe(false)
  })

  test('category must be known', () => {
    expect(transactionCategorySchema.safeParse('other').success).toBe(true)
    expect(transactionCategorySchema.safeParse('not_a_category').success).toBe(false)
  })
})

describe('isManualStatement', () => {
  test('only the manual document type matches', () => {
    expect(isManualStatement({ documentType: MANUAL_DOCUMENT_TYPE })).toBe(true)
    expect(isManualStatement({ documentType: 'bank_statement' })).toBe(false)
    expect(isManualStatement({ documentType: 'credit_card_statement' })).toBe(false)
  })
})
