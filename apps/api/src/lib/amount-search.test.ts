import { describe, expect, test } from 'bun:test'
import { parseAmountSearch, parseSearchTerms } from './amount-search'

/** Mirror of the SQL conditions for one term against an amount */
function matches(search: string, amount: number): boolean {
  const [term] = parseSearchTerms(search)
  const parsed = term && parseAmountSearch(term)
  if (!parsed) return false
  if (parsed.kind === 'exact') return Math.abs(amount - parsed.value) < 0.005
  if (parsed.rounded !== null && Math.round(amount) === parsed.rounded) return true
  if (parsed.kind === 'partial') return amount.toFixed(2).includes(parsed.text)
  return amount >= parsed.min && amount < parsed.max
}

describe('parseSearchTerms', () => {
  test('splits on whitespace', () => {
    expect(parseSearchTerms('swiggy  food')).toEqual([
      { text: 'swiggy', quoted: false },
      { text: 'food', quoted: false },
    ])
  })

  test('a quoted phrase stays together', () => {
    expect(parseSearchTerms('"american express" 50')).toEqual([
      { text: 'american express', quoted: true },
      { text: '50', quoted: false },
    ])
  })

  test('an open quote counts as closed and empty quotes are dropped', () => {
    expect(parseSearchTerms('"50')).toEqual([{ text: '50', quoted: true }])
    expect(parseSearchTerms('"" swiggy')).toEqual([{ text: 'swiggy', quoted: false }])
  })
})

describe('parseAmountSearch', () => {
  test('part of an amount finds it', () => {
    expect(matches('167623', 167623.58)).toBe(true)
    expect(matches('1676', 167623.58)).toBe(true)
    expect(matches('623', 167623.58)).toBe(true)
    expect(matches('623.58', 167623.58)).toBe(true)
    expect(matches('623.5', 167623.58)).toBe(true)
    expect(matches('999', 167623.58)).toBe(false)
  })

  test('commas, spaces and currency symbols are ignored', () => {
    expect(matches('1,67,623', 167623.58)).toBe(true)
    expect(matches('₹1,67,623', 167623.58)).toBe(true)
  })

  test('a whole amount typed with decimals matches the stored two decimals', () => {
    expect(matches('1200.00', 1200)).toBe(true)
    expect(matches('33247.9', 33247.9)).toBe(true)
  })

  test('short numbers match by precision instead of anywhere', () => {
    expect(matches('50', 50.25)).toBe(true)
    expect(matches('50', 150.25)).toBe(false)
    expect(matches('5.5', 5.52)).toBe(true)
    expect(matches('5.5', 5.6)).toBe(false)
  })

  test('a whole number also finds the amounts that round to it', () => {
    expect(matches('1,67,624', 167623.58)).toBe(true)
    expect(matches('167625', 167623.58)).toBe(false)
    // With decimals the term is taken literally
    expect(matches('167623.6', 167623.58)).toBe(false)
  })

  test('a quoted number is exactly that amount', () => {
    expect(matches('"50"', 50)).toBe(true)
    expect(matches('"50"', 50.25)).toBe(false)
    expect(matches('"50"', 150)).toBe(false)
    expect(matches('"1,67,623.58"', 167623.58)).toBe(true)
    expect(matches('"167623"', 167623.58)).toBe(false)
    expect(matches('"50.5"', 50.5)).toBe(true)
  })

  test('terms that are not plain numbers are not amounts', () => {
    expect(matches('swiggy', 50)).toBe(false)
    expect(matches('1005cr', 1005)).toBe(false)
    expect(matches('', 50)).toBe(false)
  })
})
