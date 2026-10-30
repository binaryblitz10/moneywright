import { describe, expect, test } from 'bun:test'
import { computeCardBalance } from './card-balance'

const END = '2026-09-30'

describe('computeCardBalance', () => {
  test('no payments leaves the statement balance unchanged', () => {
    expect(computeCardBalance(33248, END, [])).toEqual({
      balance: 33248,
      statementBalance: 33248,
      paymentsSinceStatement: 0,
      lastPaymentDate: null,
    })
  })

  test('subtracts a payment made after the statement end', () => {
    const r = computeCardBalance(33248, END, [{ date: '2026-10-15', amount: 33247.9 }])
    expect(r.balance).toBe(0.1)
    expect(r.statementBalance).toBe(33248)
    expect(r.paymentsSinceStatement).toBe(33247.9)
    expect(r.lastPaymentDate).toBe('2026-10-15')
  })

  test('does not subtract a payment on the statement end date', () => {
    const r = computeCardBalance(33248, END, [{ date: END, amount: 5000 }])
    expect(r.balance).toBe(33248)
    expect(r.paymentsSinceStatement).toBe(0)
    expect(r.lastPaymentDate).toBeNull()
  })

  test('sums multiple payments and ignores earlier ones', () => {
    const r = computeCardBalance(10000, END, [
      { date: '2026-10-02', amount: 1000.1 },
      { date: '2026-10-20', amount: 2000.2 },
      { date: '2026-09-15', amount: 999 },
    ])
    expect(r.balance).toBe(6999.7)
    expect(r.paymentsSinceStatement).toBe(3000.3)
    expect(r.lastPaymentDate).toBe('2026-10-20')
  })

  test('overpayment gives a negative balance', () => {
    const r = computeCardBalance(1000, END, [{ date: '2026-10-05', amount: 1500 }])
    expect(r.balance).toBe(-500)
  })

  test('exact payment rounds to zero without float artefacts', () => {
    const r = computeCardBalance(0.3, END, [
      { date: '2026-10-05', amount: 0.1 },
      { date: '2026-10-06', amount: 0.2 },
    ])
    expect(r.balance).toBe(0)
    expect(Object.is(r.balance, -0)).toBe(false)
  })

  test('null statement balance stays null even with payments', () => {
    const r = computeCardBalance(null, END, [{ date: '2026-10-05', amount: 500 }])
    expect(r).toEqual({
      balance: null,
      statementBalance: null,
      paymentsSinceStatement: 0,
      lastPaymentDate: null,
    })
  })

  describe('with activity on the card since the statement', () => {
    const charge = (date: string, amount: number) => ({
      date,
      type: 'debit' as const,
      amount,
      category: 'shopping',
    })
    const payment = (date: string, amount: number) => ({
      date,
      type: 'credit' as const,
      amount,
      category: 'credit_card_payment',
    })

    test('a paid statement still owes the charges made since', () => {
      const r = computeCardBalance(
        52393.27,
        END,
        [{ date: '2026-10-19', amount: 52393.27 }],
        [
          charge('2026-10-20', 30000),
          charge('2026-10-26', 6510.67),
          payment('2026-10-19', 52393.27),
        ]
      )
      expect(r.balance).toBe(36510.67)
      expect(r.paymentsSinceStatement).toBe(52393.27)
    })

    test('a payment seen on both sides is counted once', () => {
      const r = computeCardBalance(
        1000,
        END,
        [{ date: '2026-10-05', amount: 1000 }],
        [payment('2026-10-06', 1000)]
      )
      expect(r.balance).toBe(0)
      expect(r.paymentsSinceStatement).toBe(1000)
    })

    test('a payment only seen on the card still counts', () => {
      const r = computeCardBalance(1000, END, [], [payment('2026-10-06', 1000)])
      expect(r.balance).toBe(0)
      expect(r.lastPaymentDate).toBe('2026-10-06')
    })

    test('refunds reduce the balance but are not payments', () => {
      const r = computeCardBalance(
        1000,
        END,
        [],
        [{ date: '2026-10-08', type: 'credit', amount: 200, category: 'shopping' }]
      )
      expect(r.balance).toBe(800)
      expect(r.paymentsSinceStatement).toBe(0)
    })

    test('activity on or before the statement end is already in the statement', () => {
      const r = computeCardBalance(1000, END, [], [charge(END, 500), charge('2026-09-01', 500)])
      expect(r.balance).toBe(1000)
    })
  })
})
