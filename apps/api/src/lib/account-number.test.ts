import { describe, expect, test } from 'bun:test'
import { accountNumbersMatch, normalizeAccountNumber, getLast4 } from './account-number'

const hdfcCard = { institution: 'hdfc', type: 'credit_card' }
const side = (accountNumber: string | null, ctx = hdfcCard) => ({ accountNumber, ...ctx })

describe('normalizeAccountNumber', () => {
  test('strips separators and unifies mask characters', () => {
    expect(normalizeAccountNumber(' 4572-xx** ••●● 1234 ')).toBe('4572XXXXXXXX1234')
  })
  test('handles empty values', () => {
    expect(normalizeAccountNumber(null)).toBe('')
    expect(normalizeAccountNumber(undefined)).toBe('')
  })
})

describe('getLast4', () => {
  test('returns visible last 4 only', () => {
    expect(getLast4('XXXX 1234')).toBe('1234')
    expect(getLast4('1234XXXX')).toBeNull()
    expect(getLast4('12')).toBeNull()
  })
})

describe('accountNumbersMatch', () => {
  test('different mask characters, same bank and type', () => {
    expect(accountNumbersMatch(side('****1234'), side('XXXXXXXXXXXX1234'))).toBe(true)
    expect(accountNumbersMatch(side('••••1234'), side('xxxx1234'))).toBe(true)
  })

  test('first digits shown on one side only, same bank', () => {
    expect(accountNumbersMatch(side('4572XXXXXXXX1234'), side('XXXXXXXX1234'))).toBe(true)
  })

  test('first and last digits shown on both sides need no context', () => {
    expect(accountNumbersMatch('4572XXXXXXXX1234', '4572 XXXX XXXX 1234')).toBe(true)
    expect(accountNumbersMatch('4572XXXXXXXX1234', '4573XXXXXXXX1234')).toBe(false)
  })

  test('same last 4 at different banks does not match', () => {
    expect(
      accountNumbersMatch(
        side('XXXX1234'),
        side('XXXX1234', { institution: 'icici', type: 'credit_card' })
      )
    ).toBe(false)
  })

  test('same last 4 and bank but different type does not match', () => {
    expect(
      accountNumbersMatch(
        side('XXXX1234'),
        side('XXXX1234', { institution: 'hdfc', type: 'savings' })
      )
    ).toBe(false)
  })

  test('last 4 only without institution info does not match', () => {
    expect(accountNumbersMatch('XXXX1234', 'XXXX1234')).toBe(false)
    expect(accountNumbersMatch(side('XXXX1234'), { accountNumber: 'XXXX1234' })).toBe(false)
  })

  test('different last 4 does not match', () => {
    expect(accountNumbersMatch(side('XXXX1234'), side('XXXX1235'))).toBe(false)
  })

  test('full numbers with and without spaces or dashes', () => {
    expect(accountNumbersMatch('1234 5678 9012 3456', '1234567890123456')).toBe(true)
    expect(accountNumbersMatch('1234-5678-9012-3456', '1234567890123456')).toBe(true)
    expect(accountNumbersMatch('1234567890123456', '1234567890123457')).toBe(false)
  })

  test('full number against masked version of it', () => {
    expect(accountNumbersMatch(side('4572123456781234'), side('XXXXXXXXXXXX1234'))).toBe(true)
    expect(accountNumbersMatch('4572123456781234', '4572XXXXXXXX1234')).toBe(true)
    expect(accountNumbersMatch('4999123456781234', '4572XXXXXXXX1234')).toBe(false)
  })

  test('lowercase x is a mask', () => {
    expect(accountNumbersMatch(side('xxxx-xxxx-xxxx-1234'), side('XXXXXXXXXXXX1234'))).toBe(true)
  })

  test('masked number without visible last 4 never matches', () => {
    expect(accountNumbersMatch('4572XXXXXXXX', '4572XXXXXXXX')).toBe(false)
  })

  test('empty and null inputs', () => {
    expect(accountNumbersMatch(null, null)).toBe(false)
    expect(accountNumbersMatch('', 'XXXX1234')).toBe(false)
    expect(accountNumbersMatch(side(null), side('XXXX1234'))).toBe(false)
    expect(accountNumbersMatch(undefined, '1234567890')).toBe(false)
  })
})
