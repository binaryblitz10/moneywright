import { describe, expect, test } from 'bun:test'
import { computeCashFlow, toBreakdown, type CashFlowTransaction } from './cashflow'

const DATE = '2026-09-10'

function txn(category: string, type: 'credit' | 'debit', amount: number): CashFlowTransaction {
  return { date: DATE, type, amount, category }
}

const sample: CashFlowTransaction[] = [
  txn('salary', 'credit', 100000),
  txn('shopping', 'debit', 20000),
  txn('shopping', 'credit', 5000),
  txn('food_dining', 'debit', 10000),
  txn('travel', 'credit', 8000),
  txn('investment', 'debit', 15000),
  txn('credit_card_payment', 'debit', 30000),
  txn('credit_card_payment', 'credit', 30000),
  txn('rent', 'debit', 25000),
]

describe('computeCashFlow', () => {
  test('totals by kind for the sample month', () => {
    const result = computeCashFlow(sample)
    expect(result.income).toBe(100000)
    expect(result.expenses).toBe(42000)
    expect(result.invested).toBe(15000)
    expect(result.transferNet).toBe(0)
  })

  test('travel refund is a negative expense and sorts last in breakdown', () => {
    const result = computeCashFlow(sample)
    const travel = result.byCategory.find((c) => c.category === 'travel')
    expect(travel?.net).toBe(8000)

    const expenseBreakdown = toBreakdown(result.byCategory, 'expense')
    const last = expenseBreakdown[expenseBreakdown.length - 1]
    expect(last).toEqual({ category: 'travel', total: -8000, count: 1 })
  })

  test('identity: income - expenses - invested - transferNet equals credits minus debits', () => {
    const result = computeCashFlow(sample)
    const credits = sample.filter((t) => t.type === 'credit').reduce((s, t) => s + t.amount, 0)
    const debits = sample.filter((t) => t.type === 'debit').reduce((s, t) => s + t.amount, 0)
    const identity = result.income - result.expenses - result.invested - result.transferNet

    expect(identity).toBe(43000)
    expect(credits - debits).toBe(43000)
  })

  test('excluded category is dropped from totals and byCategory', () => {
    const result = computeCashFlow(sample, { excludeCategories: ['rent'] })
    expect(result.expenses).toBe(17000)
    expect(result.byCategory.some((c) => c.category === 'rent')).toBe(false)
  })

  test('groupByMonth months sum to the overall totals', () => {
    const transactions: CashFlowTransaction[] = [
      ...sample,
      { date: '2026-10-02', type: 'credit', amount: 90000, category: 'salary' },
      { date: '2026-10-05', type: 'debit', amount: 4000, category: 'food_dining' },
    ]
    const result = computeCashFlow(transactions, { groupByMonth: true })

    expect(result.months.map((m) => m.month)).toEqual(['2026-09', '2026-10'])
    const sum = (key: 'income' | 'expenses' | 'invested' | 'transferNet') =>
      result.months.reduce((s, m) => s + m[key], 0)
    expect(sum('income')).toBe(result.income)
    expect(sum('expenses')).toBe(result.expenses)
    expect(sum('invested')).toBe(result.invested)
    expect(sum('transferNet')).toBe(result.transferNet)
    expect(result.months[1]?.income).toBe(90000)
  })

  test('months is empty unless groupByMonth is set', () => {
    expect(computeCashFlow(sample).months).toEqual([])
  })

  test('unknown category code counts as expense', () => {
    const result = computeCashFlow([txn('not_a_real_category', 'debit', 500)])
    expect(result.expenses).toBe(500)
    expect(result.expenseCount).toBe(1)
    expect(result.byCategory[0]?.kind).toBe('expense')
  })

  test('investment credit larger than debit gives negative invested', () => {
    const result = computeCashFlow([
      txn('investment', 'debit', 1000),
      txn('investment', 'credit', 4000),
    ])
    expect(result.invested).toBe(-3000)
    expect(result.investmentCount).toBe(2)
  })
})
