import { describe, expect, it } from 'bun:test'
import { computeBankBalance } from './bank-balance'

describe('computeBankBalance', () => {
  it('returns null without a statement balance', () => {
    expect(computeBankBalance(null, '2026-09-30', [])).toBeNull()
  })

  it('keeps the statement balance when nothing happened since', () => {
    expect(computeBankBalance(1000, '2026-09-30', [])).toBe(1000)
  })

  it('adds credits and subtracts debits dated after the statement', () => {
    const activity = [
      { date: '2026-10-02', type: 'credit' as const, amount: 500 },
      { date: '2026-10-03', type: 'debit' as const, amount: 200.5 },
    ]
    expect(computeBankBalance(1000, '2026-09-30', activity)).toBe(1299.5)
  })

  it('ignores transactions on or before the statement end', () => {
    const activity = [
      { date: '2026-09-30', type: 'debit' as const, amount: 300 },
      { date: '2026-09-15', type: 'credit' as const, amount: 100 },
    ]
    expect(computeBankBalance(1000, '2026-09-30', activity)).toBe(1000)
  })
})
