import { describe, expect, test } from 'bun:test'
import {
  compareDuplicate,
  pickKeeper,
  references,
  sourceFromHash,
  type DuplicateCandidate,
} from './duplicate-score'

const base: DuplicateCandidate = {
  accountId: 'acc1',
  date: '2026-09-10',
  type: 'debit',
  amount: 250,
  description: 'UPI/Zomato/food order',
  statementId: 's1',
  source: 'statement',
}

describe('references', () => {
  test('finds 12-digit RRNs and ignores shorter or longer digit runs', () => {
    expect(references('UPI/412345678901/Zomato')).toEqual(['412345678901'])
    expect(references('UPI/41234567890/Zomato')).toEqual([])
    expect(references('Txn 4123456789012345')).toEqual([])
  })

  test('finds UTR-like tokens with enough digits', () => {
    expect(references('NEFT HDFCN52024010112345678 Rent')).toEqual(['HDFCN52024010112345678'])
    expect(references('hdfcn52024010112345678')).toEqual(['HDFCN52024010112345678'])
    expect(references('AMAZONPAYMENTSINDIA')).toEqual([])
  })

  test('ignores masked card numbers', () => {
    expect(references('POS 4111XXXXXXXX1234 Shop')).toEqual([])
    expect(references('POS 4111 **** **** 1234 Shop')).toEqual([])
  })
})

describe('compareDuplicate', () => {
  test('different account, type or amount is none', () => {
    expect(compareDuplicate(base, { ...base, accountId: 'acc2' }).tier).toBe('none')
    expect(compareDuplicate(base, { ...base, type: 'credit' }).tier).toBe('none')
    expect(compareDuplicate(base, { ...base, amount: 250.5 }).tier).toBe('none')
  })

  test('amounts compare to 2 decimals', () => {
    expect(compareDuplicate(base, { ...base, amount: 250.0004, statementId: 's2' }).tier).toBe(
      'sure'
    )
  })

  test('different reference numbers are different', () => {
    const a = { ...base, description: 'UPI/412345678901/Zomato' }
    const b = { ...base, description: 'UPI/412345678902/Zomato', statementId: 's2' }
    expect(compareDuplicate(a, b).tier).toBe('different')
  })

  test('a shared reference within 3 days is sure, beyond that it is not', () => {
    const a = { ...base, description: 'UPI/412345678901/Zomato' }
    const near = { ...a, description: 'Zomato 412345678901', date: '2026-09-13' }
    const result = compareDuplicate(a, near)
    expect(result.tier).toBe('sure')
    expect(result.reasons[0]).toBe('Same reference number 412345678901')
    expect(compareDuplicate(a, { ...near, date: '2026-09-14' }).tier).toBe('none')
  })

  test('same day and description from two statements is sure', () => {
    const result = compareDuplicate(base, { ...base, statementId: 's2' })
    expect(result.tier).toBe('sure')
    expect(result.reasons).toContain('From 2 different statements')
  })

  test('same day and description from a statement and an SMS is sure', () => {
    expect(compareDuplicate(base, { ...base, source: 'sms' }).tier).toBe('sure')
  })

  test('same day and description within one statement is likely', () => {
    const result = compareDuplicate(base, base)
    expect(result.tier).toBe('likely')
    expect(result.reasons).toEqual(['Same day, same amount, similar description'])
  })

  test('nearby days with matching descriptions and no references is likely', () => {
    const result = compareDuplicate(base, { ...base, date: '2026-09-11', statementId: 's2' })
    expect(result.tier).toBe('likely')
    expect(result.reasons).toContain('1 day apart')
    expect(compareDuplicate(base, { ...base, date: '2026-09-14' }).tier).toBe('none')
  })

  test('unrelated descriptions are none', () => {
    expect(compareDuplicate(base, { ...base, description: 'Coffee Shop' }).tier).toBe('none')
  })
})

describe('pickKeeper', () => {
  const row = (id: string, source: 'statement' | 'sms' | 'manual', createdAt: string) => ({
    id,
    source,
    createdAt,
  })

  test('prefers statement over sms over manual', () => {
    const rows = [
      row('a', 'manual', '2026-01-01'),
      row('b', 'sms', '2026-01-02'),
      row('c', 'statement', '2026-01-03'),
    ]
    expect(pickKeeper(rows)?.id).toBe('c')
    expect(pickKeeper(rows.slice(0, 2))?.id).toBe('b')
  })

  test('then the earliest created, then the lowest id', () => {
    expect(
      pickKeeper([row('b', 'statement', '2026-01-02'), row('c', 'statement', '2026-01-01')])?.id
    ).toBe('c')
    expect(
      pickKeeper([row('b', 'statement', '2026-01-01'), row('a', 'statement', '2026-01-01')])?.id
    ).toBe('a')
  })

  test('handles Date createdAt and empty input', () => {
    const rows = [
      { id: 'x', source: 'statement' as const, createdAt: new Date('2026-01-02') },
      { id: 'y', source: 'statement' as const, createdAt: new Date('2026-01-01') },
    ]
    expect(pickKeeper(rows)?.id).toBe('y')
    expect(pickKeeper([])).toBeUndefined()
  })
})

describe('sourceFromHash', () => {
  test('reads the hash prefix', () => {
    expect(sourceFromHash('sms:abc')).toBe('sms')
    expect(sourceFromHash('manual:abc')).toBe('manual')
    expect(sourceFromHash('9f8a')).toBe('statement')
  })
})
