import { describe, expect, test } from 'bun:test'
import {
  normalizeTerms,
  resolveRuleFields,
  ruleMatches,
  termMatches,
  type RuleForMatching,
} from './transaction-rules'

const UPI = 'UPI/P2A/622825390935/SAGAR  SI/AXIS BANK/remarks//P2V/'
const UBER = 'UBERDIRECTES_PBV AMSTERDAM'
const ZERODHA = 'ACH-DR-ZERODHA BROKING LTD-2S56F2Q916ZSU5-UTIB701'
const SWIGGY = 'SWIGGY,BENGALURU RESTAURANTS'

function rule(overrides: Partial<RuleForMatching>): RuleForMatching {
  return {
    matchTerms: ['uber'],
    transactionType: null,
    name: null,
    category: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('normalizeTerms', () => {
  test('trims, lowercases, collapses spaces, drops empties and duplicates', () => {
    expect(normalizeTerms(['  Sagar   SI ', 'sagar si', '', '   ', 'UBER'])).toEqual([
      'sagar si',
      'uber',
    ])
  })
})

describe('termMatches', () => {
  test('one-word term matches part of a word, ignoring case', () => {
    expect(termMatches('uber', UBER)).toBe(true)
    expect(termMatches('Zerodha', ZERODHA)).toBe(true)
    expect(termMatches('swig', SWIGGY)).toBe(true)
    expect(termMatches('lyft', UBER)).toBe(false)
  })

  test('phrase matches words in order with any spacing or punctuation between', () => {
    expect(termMatches('sagar si', 'UPI/P2A/1/SAGAR  SI/AXIS BANK')).toBe(true)
    expect(termMatches('sagar si', 'UPI/P2A/1/SAGAR/SI/AXIS BANK')).toBe(true)
    expect(termMatches('sagar si', UPI)).toBe(true)
  })

  test('last word of a phrase may start a longer word', () => {
    expect(termMatches('sagar si', 'UPI/P2A/1/SAGAR SINGHVI/AXIS BANK')).toBe(true)
  })

  test('earlier words of a phrase must be whole words', () => {
    expect(termMatches('sagar si', 'UPI/P2A/1/SAGARS SI/AXIS BANK')).toBe(false)
    expect(termMatches('sagar si', 'UPI/P2A/1/XSAGAR SI/AXIS BANK')).toBe(false)
  })

  test('phrase words must be in order and adjacent', () => {
    expect(termMatches('sagar si', 'UPI/P2A/1/SI SAGAR/AXIS BANK')).toBe(false)
    expect(termMatches('sagar si', 'SAGAR KUMAR SI')).toBe(false)
  })

  test('special characters in a term are matched literally', () => {
    expect(termMatches('h&m', 'POS H&M STORE')).toBe(true)
    expect(termMatches('a.b', 'AXB')).toBe(false)
    expect(termMatches('amazon pay (india', 'AMAZON PAY (INDIA) PVT')).toBe(true)
  })

  test('handles accented letters as word characters', () => {
    expect(termMatches('café noir', 'POS CAFÉ  NOIR PARIS')).toBe(true)
    expect(termMatches('noir', 'CAFÉNOIR')).toBe(true)
    expect(termMatches('café noir', 'XCAFÉ NOIR')).toBe(false)
  })
})

describe('ruleMatches', () => {
  test('all terms must match, in any order', () => {
    const txn = { description: ZERODHA, type: 'debit' }
    expect(ruleMatches(rule({ matchTerms: ['zerodha', 'ach'] }), txn)).toBe(true)
    expect(ruleMatches(rule({ matchTerms: ['ach', 'zerodha'] }), txn)).toBe(true)
  })

  test('fails when a term is missing', () => {
    const txn = { description: ZERODHA, type: 'debit' }
    expect(ruleMatches(rule({ matchTerms: ['zerodha', 'groww'] }), txn)).toBe(false)
  })

  test('a rule without terms never matches', () => {
    expect(ruleMatches(rule({ matchTerms: [] }), { description: UBER, type: 'debit' })).toBe(false)
  })

  test('transaction type filter', () => {
    const credit = { description: UPI, type: 'credit' }
    const debit = { description: UPI, type: 'debit' }
    const creditOnly = rule({ matchTerms: ['sagar si'], transactionType: 'credit' })
    expect(ruleMatches(creditOnly, credit)).toBe(true)
    expect(ruleMatches(creditOnly, debit)).toBe(false)
    const both = rule({ matchTerms: ['sagar si'], transactionType: null })
    expect(ruleMatches(both, credit)).toBe(true)
    expect(ruleMatches(both, debit)).toBe(true)
  })
})

describe('resolveRuleFields', () => {
  const txn = { description: UBER, type: 'debit' }

  test('returns nothing when no rule matches', () => {
    expect(resolveRuleFields([rule({ matchTerms: ['lyft'], name: 'Lyft' })], txn)).toEqual({})
  })

  test('resolves each field independently from the most specific rule that sets it', () => {
    const rules = [
      rule({ matchTerms: ['uber'], name: 'Uber', category: 'transport' }),
      rule({ matchTerms: ['uber', 'amsterdam'], name: 'Uber Amsterdam' }),
    ]
    expect(resolveRuleFields(rules, txn)).toEqual({
      name: 'Uber Amsterdam',
      category: 'transport',
    })
  })

  test('longer terms win when the term count is equal', () => {
    const rules = [
      rule({ matchTerms: ['ube'], category: 'shopping' }),
      rule({ matchTerms: ['uberdirect'], category: 'transport' }),
    ]
    expect(resolveRuleFields(rules, txn)).toEqual({ category: 'transport' })
  })

  test('most recently updated wins as the final tie-break', () => {
    const rules = [
      rule({ matchTerms: ['uber'], name: 'Old', updatedAt: '2026-01-01T00:00:00.000Z' }),
      rule({ matchTerms: ['uber'], name: 'New', updatedAt: '2026-06-01T00:00:00.000Z' }),
    ]
    expect(resolveRuleFields(rules, txn)).toEqual({ name: 'New' })
  })

  test('works with other description formats', () => {
    const rules = [rule({ matchTerms: ['swiggy'], name: 'Swiggy', category: 'food_dining' })]
    expect(resolveRuleFields(rules, { description: SWIGGY, type: 'debit' })).toEqual({
      name: 'Swiggy',
      category: 'food_dining',
    })
  })
})
