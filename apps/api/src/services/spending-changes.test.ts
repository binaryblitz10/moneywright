import { describe, expect, test } from 'bun:test'
import {
  computeSpendingChanges,
  firstUsableMonth,
  isSignificantChange,
  average,
  merchantKey,
  merchantName,
  percentile,
  pickDefaultMonth,
  shiftMonth,
  type ChangeTransaction,
  type SpendingChangesReport,
} from './spending-changes'

let nextId = 0
function txn(
  date: string,
  amount: number,
  summary: string | null,
  category = 'food_dining',
  type: 'credit' | 'debit' = 'debit'
): ChangeTransaction {
  return {
    id: `t${nextId++}`,
    date,
    type,
    amount,
    category,
    summary,
    originalDescription: `RAW ${summary ?? 'DESC'} 123`,
  }
}

const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
const TODAY = '2026-10-17'

/** Steady 20,000 monthly Swiggy spend April-August */
function steadyBaseline(): ChangeTransaction[] {
  return ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'].map((m) =>
    txn(`${m}-10`, 20000, 'Swiggy')
  )
}

function ok(result: ReturnType<typeof computeSpendingChanges>): SpendingChangesReport {
  if (result.status !== 'ok') throw new Error('expected ok')
  return result
}

describe('average / percentile', () => {
  test('average of a list and of an empty list', () => {
    expect(average([3, 1, 2])).toBe(2)
    expect(average([1, 2, 3, 10])).toBe(4)
    expect(average([])).toBe(0)
  })

  test('percentile interpolates', () => {
    expect(percentile([], 0.95)).toBeNull()
    expect(percentile([10], 0.95)).toBe(10)
    expect(percentile([0, 100], 0.95)).toBe(95)
  })
})

describe('merchantKey', () => {
  test('uses the whole name, lowercased', () => {
    expect(merchantKey({ summary: 'Zerodha Broking', originalDescription: 'x' })).toBe(
      'zerodha broking'
    )
  })

  test('collapses whitespace and trims', () => {
    expect(merchantKey({ summary: '  Rahul   Sharma ', originalDescription: 'x' })).toBe(
      'rahul sharma'
    )
  })

  test('falls back to the original description when there is no summary', () => {
    expect(merchantKey({ summary: null, originalDescription: 'UPI-ZOMATO-123 foo' })).toBe(
      'upi-zomato-123 foo'
    )
    expect(merchantKey({ summary: '  ', originalDescription: 'Amazon  Pay' })).toBe('amazon pay')
  })

  test('truncates the fallback description to 50 characters', () => {
    const description = 'A'.repeat(60)
    expect(merchantKey({ summary: null, originalDescription: description })).toBe('a'.repeat(50))
  })
})

describe('merchantName', () => {
  test('is the whole trimmed name as written', () => {
    expect(merchantName({ summary: ' YouTube Google ', originalDescription: 'x' })).toBe(
      'YouTube Google'
    )
  })

  test('falls back to the original description', () => {
    expect(merchantName({ summary: null, originalDescription: 'Amazon Pay ' })).toBe('Amazon Pay')
  })
})

describe('months', () => {
  test('shiftMonth crosses year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-11', 2)).toBe('2027-01')
  })

  test('default month is the latest complete month with data', () => {
    expect(pickDefaultMonth(months, TODAY)).toBe('2026-09')
    expect(pickDefaultMonth(['2026-04', '2026-05'], TODAY)).toBe('2026-05')
  })

  test('default month falls back to the previous month when only the current month has data', () => {
    expect(pickDefaultMonth(['2026-10'], TODAY)).toBe('2026-09')
  })
})

describe('isSignificantChange', () => {
  test('needs max(3000, 25% of the average)', () => {
    expect(isSignificantChange(23000, 20000)).toBe(false) // +3000 but < 5000
    expect(isSignificantChange(25000, 20000)).toBe(true)
    expect(isSignificantChange(15000, 20000)).toBe(true)
    expect(isSignificantChange(5000, 4000)).toBe(false) // +25% but < 3000
    expect(isSignificantChange(7000, 4000)).toBe(true)
  })

  test('new category needs at least 3000', () => {
    expect(isSignificantChange(2999, 0)).toBe(false)
    expect(isSignificantChange(3000, 0)).toBe(true)
  })
})

describe('firstUsableMonth', () => {
  test('uses the latest first start across accounts', () => {
    expect(firstUsableMonth(['2026-04-01', '2026-06-01'])).toBe('2026-06')
  })

  test('a mid-month start rolls to the next full month', () => {
    expect(firstUsableMonth(['2026-04-01', '2026-05-18'])).toBe('2026-06')
    expect(firstUsableMonth(['2026-12-31'])).toBe('2027-01')
  })

  test('null without any account start', () => {
    expect(firstUsableMonth([])).toBeNull()
  })
})

describe('computeSpendingChanges', () => {
  test('months before the data start month are not baselines', () => {
    // A stray March transaction must not make March a near-zero baseline month
    const txns = [txn('2026-03-05', 100, 'Stray'), ...steadyBaseline()]
    const result = ok(
      computeSpendingChanges(
        txns,
        ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'],
        {
          month: '2026-08',
          baselineMonths: 6,
          today: TODAY,
          dataStartMonth: '2026-04',
        }
      )
    )
    expect(result.baselineMonths).toEqual(['2026-04', '2026-05', '2026-06', '2026-07'])
    expect(result.totals.baselineAverage).toBe(20000)
  })

  test('too few baseline months after the data start is insufficient history', () => {
    const result = computeSpendingChanges(
      steadyBaseline(),
      ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07'],
      { month: '2026-07', today: TODAY, dataStartMonth: '2026-05' }
    )
    expect(result).toMatchObject({ status: 'insufficient_history', baselineMonthsAvailable: 2 })
  })

  test('reports insufficient history with the months available', () => {
    const result = computeSpendingChanges(
      [txn('2026-08-10', 100, 'A'), txn('2026-09-10', 100, 'A')],
      ['2026-08', '2026-09'],
      { today: TODAY }
    )
    expect(result).toMatchObject({
      status: 'insufficient_history',
      month: '2026-09',
      baselineMonthsAvailable: 1,
    })
  })

  test('baseline only counts months within the data range', () => {
    const txns = steadyBaseline()
    const result = ok(
      computeSpendingChanges(txns, ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'], {
        month: '2026-08',
        baselineMonths: 6,
        today: TODAY,
      })
    )
    expect(result.baselineMonths).toEqual(['2026-04', '2026-05', '2026-06', '2026-07'])
  })

  test('detects a category increase against the average with zeros for empty months', () => {
    // Average of the previous 3 months (Jun-Aug): 20000
    const txns = [...steadyBaseline(), txn('2026-09-05', 28000, 'Swiggy')]
    const result = ok(computeSpendingChanges(txns, months.slice(0, 6), { today: TODAY }))
    expect(result.month).toBe('2026-09')
    expect(result.isPartial).toBe(false)
    expect(result.note).toBeNull()
    expect(result.categories).toHaveLength(1)
    expect(result.categories[0]).toMatchObject({
      category: 'food_dining',
      current: 28000,
      baselineAverage: 20000,
      delta: 8000,
      direction: 'up',
    })
    expect(result.categories[0]!.deltaPct).toBeCloseTo(0.4)
    expect(result.totals).toMatchObject({ current: 28000, baselineAverage: 20000, delta: 8000 })
  })

  test('a category with spend in few baseline months has a average of 0 and is new', () => {
    const txns = [
      ...steadyBaseline(),
      txn('2026-05-03', 9000, 'Croma', 'shopping'),
      txn('2026-09-05', 12000, 'Croma', 'shopping'),
    ]
    const result = ok(computeSpendingChanges(txns, months.slice(0, 6), { today: TODAY }))
    const shopping = result.categories.find((c) => c.category === 'shopping')!
    expect(shopping.baselineAverage).toBe(0)
    expect(shopping.deltaPct).toBeNull()
    expect(shopping.current).toBe(12000)
  })

  test('the baseline is the average of the previous 3 months, so one big month raises it', () => {
    const txns = [
      txn('2026-06-10', 20000, 'Swiggy'),
      txn('2026-07-10', 20000, 'Swiggy'),
      txn('2026-08-10', 50000, 'Swiggy'),
      txn('2026-09-10', 30000, 'Swiggy'),
    ]
    const result = ok(
      computeSpendingChanges(txns, ['2026-06', '2026-07', '2026-08', '2026-09'], { today: TODAY })
    )
    expect(result.baselineMonths).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(result.totals.baselineAverage).toBe(30000)
    expect(result.categories).toHaveLength(0)
  })

  test('detects a decrease and ignores small changes', () => {
    const txns = [...steadyBaseline(), txn('2026-09-05', 10000, 'Swiggy')]
    const result = ok(computeSpendingChanges(txns, months.slice(0, 6), { today: TODAY }))
    expect(result.categories[0]).toMatchObject({ direction: 'down', delta: -10000 })

    const small = [...steadyBaseline(), txn('2026-09-05', 22000, 'Swiggy')]
    expect(
      ok(computeSpendingChanges(small, months.slice(0, 6), { today: TODAY })).categories
    ).toHaveLength(0)
  })

  test('refunds net against spending and non-expense kinds are ignored', () => {
    const txns = [
      ...steadyBaseline(),
      txn('2026-09-05', 40000, 'Swiggy'),
      txn('2026-09-06', 15000, 'Swiggy', 'food_dining', 'credit'),
      txn('2026-09-07', 90000, 'Salary', 'salary', 'credit'),
    ]
    const result = ok(computeSpendingChanges(txns, months.slice(0, 6), { today: TODAY }))
    expect(result.totals.current).toBe(25000)
  })

  test('marks the current month as partial without pro-rating', () => {
    const txns = [...steadyBaseline(), txn('2026-10-05', 30000, 'Swiggy')]
    const result = ok(computeSpendingChanges(txns, months, { month: '2026-10', today: TODAY }))
    expect(result.isPartial).toBe(true)
    expect(result.note).toContain('without pro-rating')
    expect(result.totals.current).toBe(30000)
  })

  test('top merchants explain the category delta', () => {
    const txns = [
      ...steadyBaseline(),
      txn('2026-09-02', 12000, 'Zomato'),
      txn('2026-09-03', 4000, 'Zomato'),
      txn('2026-09-04', 20000, 'Swiggy'),
    ]
    const result = ok(computeSpendingChanges(txns, months.slice(0, 6), { today: TODAY }))
    const top = result.categories[0]!.topMerchants
    expect(top[0]).toMatchObject({ merchant: 'Zomato', count: 2, amount: 16000, delta: 16000 })
    expect(top.find((m) => m.merchant === 'Swiggy')).toBeUndefined()
  })

  test('merchant movers span categories', () => {
    const txns = [
      ...steadyBaseline(),
      txn('2026-09-04', 20000, 'Swiggy'),
      txn('2026-09-05', 9000, 'Croma', 'shopping'),
    ]
    const result = ok(computeSpendingChanges(txns, months.slice(0, 6), { today: TODAY }))
    expect(result.merchants).toHaveLength(1)
    expect(result.merchants[0]).toMatchObject({
      merchant: 'Croma',
      category: 'shopping',
      current: 9000,
      baselineAverage: 0,
    })
  })

  test('flags large transactions above p95 or from new merchants', () => {
    const txns = [
      ...steadyBaseline(),
      txn('2026-09-02', 25000, 'Swiggy'), // above p95 (20000)
      txn('2026-09-03', 12000, 'Newplace'), // new merchant, below p95
      txn('2026-09-04', 9000, 'Newplace'), // under 10k threshold
      txn('2026-09-05', 15000, 'Swiggy', 'food_dining', 'credit'), // credit
    ]
    const result = ok(computeSpendingChanges(txns, months.slice(0, 6), { today: TODAY }))
    expect(result.largeTransactions.map((t) => [t.amount, t.reason])).toEqual([
      [25000, 'above_p95'],
      [12000, 'new_merchant'],
    ])
  })

  test('a known merchant below p95 is not flagged', () => {
    const txns = [...steadyBaseline(), txn('2026-09-02', 20000, 'Swiggy')]
    const result = ok(computeSpendingChanges(txns, months.slice(0, 6), { today: TODAY }))
    expect(result.largeTransactions).toHaveLength(0)
  })

  test('caps the lists', () => {
    const baseline = ['2026-04', '2026-05', '2026-06'].flatMap((m) =>
      Array.from({ length: 10 }, (_, i) => txn(`${m}-10`, 100, `Old${i}`, `cat_${i}`))
    )
    const current = Array.from({ length: 10 }, (_, i) =>
      txn('2026-07-10', 20000 + i * 1000, `New${i}`, `cat_${i}`)
    )
    const result = ok(
      computeSpendingChanges([...baseline, ...current], months.slice(0, 4), {
        month: '2026-07',
        today: TODAY,
      })
    )
    expect(result.categories).toHaveLength(8)
    expect(result.merchants).toHaveLength(5)
    expect(result.largeTransactions).toHaveLength(5)
    expect(result.categories[0]!.delta).toBeGreaterThan(result.categories[1]!.delta)
  })
})
