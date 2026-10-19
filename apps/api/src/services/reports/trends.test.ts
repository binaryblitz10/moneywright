import { describe, expect, test } from 'bun:test'
import { computeTrend, computeTrends } from './trends'
import type { ReportAccount, ReportTransaction } from './shared'

function txn(
  date: string,
  amount: number,
  category: string,
  summary: string,
  type: 'credit' | 'debit' = 'debit',
  accountId = 'bank'
): ReportTransaction {
  return { date, type, amount, category, accountId, summary, originalDescription: `RAW ${summary}` }
}

const accounts: ReportAccount[] = [
  { id: 'bank', name: 'HDFC Savings', type: 'bank', last4: '1234' },
  { id: 'card', name: 'ICICI Card', type: 'card', last4: '9876' },
]

describe('computeTrend', () => {
  test('null under two months', () => {
    expect(computeTrend([])).toBeNull()
    expect(computeTrend([5000])).toBeNull()
  })

  test('rising and falling need 20% and 500 a month', () => {
    expect(computeTrend([1000, 2000])).toBe('rising')
    expect(computeTrend([2000, 1000])).toBe('falling')
    // +10%
    expect(computeTrend([10000, 11000])).toBe('steady')
    // +30% but only 300 a month
    expect(computeTrend([1000, 1300])).toBe('steady')
  })

  test('the middle month of an odd count is ignored', () => {
    expect(computeTrend([1000, 90000, 2000])).toBe('rising')
  })

  test('compares the average of each half', () => {
    expect(computeTrend([1000, 1000, 3000, 3000])).toBe('rising')
    expect(computeTrend([1000, 3000, 1000, 3000])).toBe('steady')
  })

  test('from nothing to a real amount is rising', () => {
    expect(computeTrend([0, 800])).toBe('rising')
  })
})

describe('computeTrends', () => {
  const months = ['2026-07', '2026-08', '2026-09']
  const transactions = [
    txn('2026-07-05', 1000, 'food_dining', 'Swiggy'),
    txn('2026-08-05', 1500, 'food_dining', 'Swiggy', 'debit', 'card'),
    txn('2026-09-05', 3000, 'food_dining', 'Swiggy', 'debit', 'card'),
    txn('2026-09-06', 500, 'food_dining', 'Swiggy', 'credit', 'card'),
    txn('2026-08-10', 20000, 'rent', 'Landlord'),
    txn('2026-07-01', 90000, 'salary', 'Employer', 'credit'),
    txn('2026-08-20', 5000, 'investment', 'Zerodha'),
    txn('2026-06-30', 999, 'rent', 'Before range'),
  ]
  const result = computeTrends({ transactions, months, accounts })

  test('category matrix holds net expense per month, with totals and averages', () => {
    expect(result.categories.map((c) => c.key)).toEqual(['rent', 'food_dining'])
    const food = result.categories.find((c) => c.key === 'food_dining')!
    expect(food.months).toEqual([1000, 1500, 2500])
    expect(food.total).toBe(5000)
    expect(food.average).toBeCloseTo(5000 / 3)
    expect(result.monthTotals).toEqual([1000, 21500, 2500])
    expect(result.total).toBe(25000)
    expect(result.average).toBeCloseTo(25000 / 3)
  })

  test('merchants carry payments, average per payment, monthly series and trend', () => {
    const swiggy = result.merchants.find((s) => s.label === 'Swiggy')!
    expect(swiggy.payments).toBe(3)
    expect(swiggy.total).toBe(5000)
    expect(swiggy.averagePerPayment).toBeCloseTo(5500 / 3)
    expect(swiggy.months).toEqual([1000, 1500, 2500])
    expect(swiggy.trend).toBe('rising')
    expect(result.merchants.map((s) => s.label)).not.toContain('Zerodha')
    expect(result.merchants.map((s) => s.label)).not.toContain('Employer')
  })

  test('accounts split spend by where it went', () => {
    const card = result.accounts.find((a) => a.key === 'card')!
    expect(card).toMatchObject({ label: 'ICICI Card', last4: '9876', type: 'card', total: 4000 })
    expect(card.months).toEqual([0, 1500, 2500])
    expect(result.accounts[0]!.key).toBe('bank')
  })

  test('a one month range has no trend', () => {
    const one = computeTrends({
      transactions: [txn('2026-09-05', 3000, 'food_dining', 'Swiggy')],
      months: ['2026-09'],
      accounts,
    })
    expect(one.merchants[0]!.trend).toBeNull()
  })
})
