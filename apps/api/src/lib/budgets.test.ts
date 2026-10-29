import { describe, expect, test } from 'bun:test'
import { computeBudgetProgress, isMonth, monthRange, previousMonth } from './budgets'

describe('month helpers', () => {
  test('isMonth accepts only YYYY-MM', () => {
    expect(isMonth('2026-10')).toBe(true)
    expect(isMonth('2026-13')).toBe(false)
    expect(isMonth('2026-1')).toBe(false)
    expect(isMonth('2026-10-01')).toBe(false)
  })

  test('previousMonth crosses the year boundary', () => {
    expect(previousMonth('2026-10')).toBe('2026-09')
    expect(previousMonth('2026-01')).toBe('2025-12')
  })

  test('monthRange covers the whole month, including leap Februaries', () => {
    expect(monthRange('2026-10')).toEqual({ startDate: '2026-10-01', endDate: '2026-10-31' })
    expect(monthRange('2026-02')).toEqual({ startDate: '2026-02-01', endDate: '2026-02-28' })
    expect(monthRange('2028-02').endDate).toBe('2028-02-29')
  })
})

describe('computeBudgetProgress', () => {
  const limit = { monthlyAmount: 10000, rollover: false }

  test('under the warning level is ok', () => {
    const p = computeBudgetProgress(limit, 4000, null)
    expect(p.remaining).toBe(6000)
    expect(p.percentUsed).toBe(40)
    expect(p.status).toBe('ok')
  })

  test('80% or more is a warning, until it goes over', () => {
    expect(computeBudgetProgress(limit, 8000, null).status).toBe('warning')
    expect(computeBudgetProgress(limit, 10000, null).status).toBe('warning')
    expect(computeBudgetProgress(limit, 10001, null).status).toBe('over')
  })

  test('over the limit gives a negative remaining amount', () => {
    const p = computeBudgetProgress(limit, 12500, null)
    expect(p.remaining).toBe(-2500)
    expect(p.percentUsed).toBe(125)
  })

  test("rollover adds last month's unspent amount", () => {
    const p = computeBudgetProgress({ ...limit, rollover: true }, 4000, 7000)
    expect(p.carriedOver).toBe(3000)
    expect(p.available).toBe(13000)
    expect(p.remaining).toBe(9000)
  })

  test('rollover never carries a deficit forward', () => {
    expect(computeBudgetProgress({ ...limit, rollover: true }, 0, 15000).carriedOver).toBe(0)
  })

  test('rollover does nothing without a previous month or when switched off', () => {
    expect(computeBudgetProgress({ ...limit, rollover: true }, 0, null).carriedOver).toBe(0)
    expect(computeBudgetProgress(limit, 0, 2000).carriedOver).toBe(0)
  })

  test('a zero limit with spending counts as over', () => {
    const p = computeBudgetProgress({ monthlyAmount: 0, rollover: false }, 50, null)
    expect(p.status).toBe('over')
    expect(p.percentUsed).toBe(100)
  })
})
