import { describe, expect, test } from 'bun:test'
import { isRealDate, isValidTransaction } from './validation'

describe('isRealDate', () => {
  test('accepts real dates, including leap days', () => {
    expect(isRealDate('2025-01-31')).toBe(true)
    expect(isRealDate('2024-02-29')).toBe(true)
  })

  test('rejects dates that do not exist', () => {
    expect(isRealDate('2025-02-30')).toBe(false)
    expect(isRealDate('2025-02-29')).toBe(false)
    expect(isRealDate('2025-04-31')).toBe(false)
    expect(isRealDate('2025-13-01')).toBe(false)
    expect(isRealDate('2025-00-10')).toBe(false)
    expect(isRealDate('2025-01-00')).toBe(false)
  })

  test('rejects the wrong format', () => {
    expect(isRealDate('25-01-10')).toBe(false)
    expect(isRealDate('2025-1-10')).toBe(false)
    expect(isRealDate('')).toBe(false)
  })
})

describe('isValidTransaction', () => {
  const base = { date: '2025-02-28', amount: 10, type: 'debit', description: 'x' }

  test('accepts a transaction with a real date', () => {
    expect(isValidTransaction(base)).toBe(true)
  })

  test('rejects a transaction dated 2025-02-30', () => {
    expect(isValidTransaction({ ...base, date: '2025-02-30' })).toBe(false)
  })
})
