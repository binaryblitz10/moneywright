import { describe, expect, test } from 'bun:test'
import { pairManualTransactions, pairTransactions, type PairRow } from './pair'

function row(id: string, description: string, overrides: Partial<PairRow> = {}): PairRow {
  return {
    id,
    accountId: 'acc',
    date: '2026-10-17',
    type: 'debit',
    amount: 885,
    originalDescription: description,
    ...overrides,
  }
}

describe('pairTransactions', () => {
  test('pairs an alert with the statement line that names the same merchant', () => {
    const result = pairTransactions(
      [row('s1', 'RAZ*Swiggy')],
      [row('t1', 'RAZORPAY*Swiggy Bangalore')]
    )
    expect(result.matched.map((m) => [m.sms.id, m.target.id])).toEqual([['s1', 't1']])
    expect(result.possible).toEqual([])
  })

  test('the same numbers with different text are only a possible match', () => {
    const result = pairTransactions(
      [row('s1', 'ICICI BANK L', { amount: 2100 })],
      [row('t1', 'EMPORIO SALON EMPORIO S SOUTH DELHI', { amount: 2100 })]
    )
    expect(result.matched).toEqual([])
    expect(result.possible).toHaveLength(1)
    expect(result.possible[0]!.candidates.map((c) => c.id)).toEqual(['t1'])
  })

  test('different date, amount, direction or account never pair', () => {
    const sms = [row('s1', 'SWIGGY')]
    for (const other of [
      { date: '2026-10-18' },
      { amount: 886 },
      { type: 'credit' },
      { accountId: 'other' },
    ]) {
      const result = pairTransactions(sms, [row('t1', 'SWIGGY', other)])
      expect(result.matched).toEqual([])
      expect(result.possible).toEqual([])
    }
  })

  test('identical purchases pair one to one', () => {
    const result = pairTransactions(
      [row('s1', 'BLINKIT'), row('s2', 'BLINKIT')],
      [row('t1', 'BLINKIT BANGALORE'), row('t2', 'BLINKIT BANGALORE')]
    )
    expect(result.matched).toHaveLength(2)
    expect(new Set(result.matched.map((m) => m.target.id)).size).toBe(2)
  })

  test('one statement line settles only one of two identical alerts', () => {
    const result = pairTransactions(
      [row('s1', 'BLINKIT'), row('s2', 'BLINKIT')],
      [row('t1', 'BLINKIT BANGALORE')]
    )
    expect(result.matched).toHaveLength(1)
    expect(result.possible).toEqual([])
  })

  test('closer text wins the statement line', () => {
    const result = pairTransactions(
      [row('s1', 'CAFE ONE'), row('s2', 'CAFE COFFEE DAY')],
      [row('t1', 'CAFE COFFEE DAY MUMBAI')]
    )
    expect(result.matched.map((m) => m.sms.id)).toEqual(['s2'])
  })

  test('a dismissed pair is not offered again', () => {
    const result = pairTransactions(
      [row('s1', 'ICICI BANK L', { amount: 2100 })],
      [row('t1', 'EMPORIO SALON', { amount: 2100 })],
      (smsId, targetId) => smsId === 's1' && targetId === 't1'
    )
    expect(result.possible).toEqual([])
  })
})

describe('pairManualTransactions', () => {
  const manual = (id: string, overrides: Partial<PairRow> = {}) =>
    row(id, 'Groceries at DMART', { id, ...overrides })

  test('the only candidate within two days matches despite different text', () => {
    const result = pairManualTransactions(
      [manual('m1')],
      [row('t1', 'UPI-AVENUE SUPERMARTS-123', { date: '2026-10-19' })]
    )
    expect(result.matched.map((m) => [m.sms.id, m.target.id])).toEqual([['m1', 't1']])
    expect(result.possible).toEqual([])
  })

  test('a candidate three days away does not pair', () => {
    const result = pairManualTransactions(
      [manual('m1')],
      [row('t1', 'UPI-AVENUE', { date: '2026-10-20' })]
    )
    expect(result.matched).toEqual([])
    expect(result.possible).toEqual([])
  })

  test('two candidates in the window are only possible matches', () => {
    const result = pairManualTransactions(
      [manual('m1')],
      [row('t1', 'UPI-A', { date: '2026-10-16' }), row('t2', 'UPI-B', { date: '2026-10-18' })]
    )
    expect(result.matched).toEqual([])
    expect(result.possible[0]!.candidates.map((c) => c.id)).toEqual(['t1', 't2'])
  })

  test('a competing provisional row makes a lone candidate only a possible match', () => {
    const result = pairManualTransactions(
      [manual('m1')],
      [row('t1', 'UPI-A')],
      [row('s1', 'ICICI BANK L')]
    )
    expect(result.matched).toEqual([])
    expect(result.possible).toHaveLength(1)
  })

  test('text overlap on the same day still matches', () => {
    const result = pairManualTransactions(
      [row('m1', 'Swiggy')],
      [row('t1', 'RAZORPAY*Swiggy Bangalore'), row('t2', 'OTHER', { date: '2026-10-18' })]
    )
    expect(result.matched.map((m) => m.target.id)).toEqual(['t1'])
  })

  test('a dismissed pair is not offered again', () => {
    const result = pairManualTransactions(
      [manual('m1')],
      [row('t1', 'UPI-A'), row('t2', 'UPI-B')],
      [],
      (_m, t) => t === 't1'
    )
    expect(result.possible[0]!.candidates.map((c) => c.id)).toEqual(['t2'])
  })
})
