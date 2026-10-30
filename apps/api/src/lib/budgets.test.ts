import { describe, expect, test } from 'bun:test'
import {
  computeBudgetMonths,
  computeBudgetProgress,
  isMonth,
  monthRange,
  monthsBetween,
  previousMonth,
  summarizeBudgetMonths,
} from './budgets'

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

describe('monthsBetween', () => {
  test('lists every month, across a year boundary', () => {
    expect(monthsBetween('2026-11', '2027-02')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ])
    expect(monthsBetween('2026-10', '2026-10')).toEqual(['2026-10'])
  })
})

describe('budget months', () => {
  const dining = {
    category: 'dining',
    monthlyAmount: 1000,
    rollover: false,
    createdMonth: '2026-01',
  }
  const food = { category: 'food', monthlyAmount: 2000, rollover: false, createdMonth: '2026-01' }
  const spending: Record<string, number> = {
    '2026-01:dining': 1500,
    '2026-01:food': 500,
    '2026-02:dining': 900,
    '2026-02:food': 2500,
    '2026-03:dining': 1200,
    '2026-03:food': 100,
    '2026-04:dining': 1100,
  }
  const spentIn = (month: string, category: string) => spending[`${month}:${category}`] ?? 0

  test('leaves out future months but applies budgets to months before they were created', () => {
    const late = { ...food, createdMonth: '2026-03' }
    const months = computeBudgetMonths(
      [dining, late],
      monthsBetween('2025-12', '2026-05'),
      spentIn,
      '2026-04'
    )
    expect(months.map((m) => m.month)).toEqual([
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
    ])
    expect(months[0]!.entries.map((e) => e.category)).toEqual(['dining', 'food'])
    expect(months[4]!.inProgress).toBe(true)
  })

  test('carries last month over only when the budget existed then', () => {
    const rolling = { ...dining, rollover: true, createdMonth: '2026-02' }
    const months = computeBudgetMonths([rolling], ['2026-02', '2026-03'], spentIn, '2026-06')
    expect(months[0]!.entries[0]!.carriedOver).toBe(0)
    // February's 900 of 1000 leaves 100 for March
    expect(months[1]!.entries[0]!.carriedOver).toBe(100)
  })

  test('judges a month by the total of its budgets', () => {
    const months = computeBudgetMonths(
      [dining, food],
      ['2026-01', '2026-02', '2026-03'],
      spentIn,
      '2026-06'
    )
    // Jan 2000 of 3000, Feb 3400 of 3000, Mar 1300 of 3000
    expect(months.map((m) => m.status)).toEqual(['ok', 'over', 'ok'])
    expect(months[1]!.totalSpent).toBe(3400)
    expect(months[1]!.totalAvailable).toBe(3000)
  })

  test('summary counts completed months and ranks the worst categories first', () => {
    const months = computeBudgetMonths(
      [dining, food],
      monthsBetween('2026-01', '2026-04'),
      spentIn,
      '2026-04'
    )
    const summary = summarizeBudgetMonths(months)
    expect(summary.completedMonths).toBe(3)
    expect(summary.monthsWithinBudget).toBe(2)
    expect(summary.categories.map((c) => c.category)).toEqual(['dining', 'food'])
    expect(summary.categories[0]).toMatchObject({
      monthsTracked: 3,
      monthsOver: 2,
      overBy: 700,
      totalSpent: 4700,
      totalAvailable: 4000,
    })
    expect(summary.categories[1]).toMatchObject({ monthsOver: 1, overBy: 500 })
  })

  test('the month in progress is never a miss', () => {
    const months = computeBudgetMonths([dining], ['2026-04'], spentIn, '2026-04')
    expect(months[0]!.status).toBe('over')
    expect(summarizeBudgetMonths(months)).toMatchObject({
      completedMonths: 0,
      monthsWithinBudget: 0,
    })
  })
})
