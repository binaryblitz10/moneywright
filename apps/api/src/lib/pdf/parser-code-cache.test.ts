import { describe, expect, test } from 'bun:test'
import { generateBankKey } from './parser-code-cache'

describe('generateBankKey', () => {
  test('keeps keys for known institutions unchanged', () => {
    expect(generateBankKey('HDFC', 'savings_account', 'pdf')).toBe('hdfc_savings_account:pdf')
    expect(generateBankKey('HDFC', 'savings_account', 'csv', 'acc1')).toBe(
      'hdfc_savings_account:csv'
    )
  })

  test('gives unknown banks a key per account', () => {
    expect(generateBankKey('OTHER', 'savings_account', 'csv', 'Ab-12')).toBe(
      'other_Ab_12_savings_account:csv'
    )
    expect(generateBankKey('', 'credit_card', 'pdf', 'x9')).toBe('other_x9_credit_card:pdf')
  })

  test('falls back to the shared key without an account', () => {
    expect(generateBankKey('OTHER', 'savings_account', 'pdf')).toBe('other_savings_account:pdf')
  })
})
