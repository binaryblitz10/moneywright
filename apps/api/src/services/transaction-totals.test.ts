import { describe, expect, test } from 'bun:test'
import {
  comparePeriodTotals,
  computeTotals,
  daysInRange,
  signedForKind,
  type TotalsTransaction,
} from './transaction-totals'

function txn(
  date: string,
  amount: number,
  summary: string,
  category = 'food_dining',
  type: 'credit' | 'debit' = 'debit',
  accountId = 'acc1'
): TotalsTransaction {
  return { date, type, amount, category, accountId, summary, originalDescription: `RAW ${summary}` }
}

describe('signedForKind', () => {
  test('income counts credits up, everything else counts debits up', () => {
    expect(signedForKind('income', 'credit', 100)).toBe(100)
    expect(signedForKind('income', 'debit', 100)).toBe(-100)
    expect(signedForKind('expense', 'debit', 100)).toBe(100)
    expect(signedForKind('expense', 'credit', 100)).toBe(-100)
    expect(signedForKind('investment', 'debit', 100)).toBe(100)
  })
})

describe('computeTotals', () => {
  const spending = [
    txn('2026-08-03', 500, 'Swiggy dinner'),
    txn('2026-08-20', 300, 'Swiggy lunch'),
    txn('2026-09-05', 2000, 'Amazon order', 'shopping'),
    txn('2026-09-09', 400, 'Amazon refund', 'shopping', 'credit'),
    txn('2026-09-15', 700, 'swiggy order', 'food_dining', 'debit', 'acc2'),
  ]

  test('groups by category with refunds subtracted, largest first', () => {
    const result = computeTotals(spending, { kind: 'expense', groupBy: 'category' })
    expect(result.total).toBe(3100)
    expect(result.count).toBe(5)
    expect(result.groups.map((g) => [g.key, g.total, g.count])).toEqual([
      ['shopping', 1600, 2],
      ['food_dining', 1500, 3],
    ])
    expect(result.groups[0]!.label).toBe('Shopping')
  })

  test('groups merchants by first summary word regardless of case', () => {
    const result = computeTotals(spending, { kind: 'expense', groupBy: 'merchant' })
    const swiggy = result.groups.find((g) => g.key === 'swiggy')!
    expect(swiggy.total).toBe(1500)
    expect(swiggy.count).toBe(3)
    expect(swiggy.label).toBe('Swiggy')
  })

  test('month groups are chronological', () => {
    const result = computeTotals(spending, { kind: 'expense', groupBy: 'month' })
    expect(result.groups.map((g) => [g.key, g.total])).toEqual([
      ['2026-08', 800],
      ['2026-09', 2300],
    ])
    expect(result.groups[0]!.label).toBe('Aug 26')
  })

  test('account groups use the supplied names', () => {
    const accountNames = new Map([
      ['acc1', 'Axis ••1234'],
      ['acc2', 'Amex ••1001'],
    ])
    const result = computeTotals(spending, { kind: 'expense', groupBy: 'account', accountNames })
    expect(result.groups.map((g) => [g.label, g.total])).toEqual([
      ['Axis ••1234', 2400],
      ['Amex ••1001', 700],
    ])
  })

  test('income totals are credits minus reversals', () => {
    const income = [
      txn('2026-09-01', 100000, 'Salary', 'salary', 'credit'),
      txn('2026-09-02', 1000, 'Salary reversal', 'salary', 'debit'),
    ]
    expect(computeTotals(income, { kind: 'income', groupBy: 'category' }).total).toBe(99000)
  })

  test('empty input gives zero totals', () => {
    expect(computeTotals([], { kind: 'expense', groupBy: 'category' })).toEqual({
      total: 0,
      count: 0,
      groups: [],
    })
  })
})

describe('comparePeriodTotals', () => {
  const a = computeTotals(
    [txn('2026-08-03', 1000, 'Swiggy'), txn('2026-08-05', 500, 'Uber', 'travel')],
    { kind: 'expense', groupBy: 'category' }
  )
  const b = computeTotals(
    [txn('2026-09-03', 1800, 'Swiggy'), txn('2026-09-10', 3000, 'Amazon', 'shopping')],
    { kind: 'expense', groupBy: 'category' }
  )

  test('change is B minus A with percentages of A', () => {
    const result = comparePeriodTotals(a, b)
    expect(result.totalA).toBe(1500)
    expect(result.totalB).toBe(4800)
    expect(result.change).toBe(3300)
    expect(result.changePct).toBe(2.2)
  })

  test('includes groups from either period, sorted by size of change', () => {
    const result = comparePeriodTotals(a, b)
    expect(result.groups.map((g) => [g.key, g.totalA, g.totalB, g.change, g.changePct])).toEqual([
      ['shopping', 0, 3000, 3000, null],
      ['food_dining', 1000, 1800, 800, 0.8],
      ['travel', 500, 0, -500, -1],
    ])
  })
})

describe('daysInRange', () => {
  test('counts both ends', () => {
    expect(daysInRange({ startDate: '2026-09-01', endDate: '2026-09-30' })).toBe(30)
    expect(daysInRange({ startDate: '2026-10-01', endDate: '2026-10-01' })).toBe(1)
  })
})
