import { describe, expect, test } from 'bun:test'
import type { AccountCoverage, CashBridge, DataHealthReport } from '../data-health'
import { buildSavingsBreakdown, collectPeriodWarnings, computePeriodReport } from './period'
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
  { id: 'card', name: 'ICICI Card', type: 'card', last4: null },
  { id: 'idle', name: 'Old account', type: 'bank', last4: null },
]

const current = [
  txn('2026-09-01', 100000, 'salary', 'Employer', 'credit'),
  txn('2026-09-03', 5000, 'food_dining', 'Swiggy', 'debit', 'card'),
  txn('2026-09-10', 3000, 'food_dining', 'Zomato'),
  txn('2026-09-12', 1000, 'food_dining', 'Swiggy', 'credit', 'card'),
  txn('2026-09-15', 20000, 'rent', 'Landlord'),
  txn('2026-09-20', 10000, 'investment', 'Zerodha'),
]
const previous = [
  txn('2026-08-01', 80000, 'salary', 'Employer', 'credit'),
  txn('2026-08-03', 2000, 'food_dining', 'Swiggy', 'debit', 'card'),
  txn('2026-08-15', 20000, 'rent', 'Landlord'),
  txn('2026-08-18', 4000, 'groceries', 'Bigbasket'),
]

describe('computePeriodReport', () => {
  const report = computePeriodReport({
    current,
    previous,
    accounts,
  })

  test('totals match the cash flow maths', () => {
    expect(report.totals.current).toEqual({
      income: 100000,
      expenses: 27000,
      invested: 10000,
      surplus: 73000,
      savingsRate: 0.73,
    })
    expect(report.totals.previous?.expenses).toBe(26000)
    expect(report.totals.changes?.expenses).toEqual({ delta: 1000, deltaPct: 1000 / 26000 })
    expect(report.totals.savingsRateDelta).toBeCloseTo(0.73 - 0.675)
  })

  test('lists every expense category with the change, largest first', () => {
    expect(report.expenseCategories.map((c) => c.key)).toEqual(['rent', 'food_dining', 'groceries'])
    expect(report.expenseCategories[1]).toMatchObject({
      label: 'Food & Dining',
      current: 7000,
      previous: 2000,
      delta: 5000,
      deltaPct: 2.5,
      count: 3,
    })
    expect(report.expenseCategories[2]).toMatchObject({ current: 0, previous: 4000, delta: -4000 })
  })

  test('income and investment categories are listed too', () => {
    expect(report.incomeCategories[0]).toMatchObject({
      key: 'salary',
      current: 100000,
      previous: 80000,
    })
    expect(report.investmentCategories[0]).toMatchObject({
      key: 'investment',
      current: 10000,
      previous: 0,
      deltaPct: null,
    })
  })

  test('merchants are expense-only, net of refunds', () => {
    const swiggy = report.merchants.find((s) => s.label === 'Swiggy')
    expect(swiggy).toMatchObject({ current: 4000, previous: 2000, count: 2 })
    expect(report.merchants.find((s) => s.label === 'Zerodha')).toBeUndefined()
  })

  test('accounts with no transactions are left out', () => {
    expect(report.accounts.map((a) => a.id)).toEqual(['bank', 'card'])
    const bank = report.accounts.find((a) => a.id === 'bank')!
    expect(bank.current).toEqual({ income: 100000, expenses: 23000, invested: 10000 })
    expect(bank.previous).toEqual({ income: 80000, expenses: 24000, invested: 0 })
  })

  test('without a comparison nothing has a previous value', () => {
    const solo = computePeriodReport({ current, previous: null, accounts })
    expect(solo.totals.previous).toBeNull()
    expect(solo.totals.changes).toBeNull()
    expect(solo.expenseCategories.every((c) => c.previous === null && c.deltaPct === null)).toBe(
      true
    )
    expect(solo.accounts.every((a) => a.previous === null)).toBe(true)
  })
})

describe('buildSavingsBreakdown', () => {
  const bridge = (overrides: Partial<CashBridge>): CashBridge => ({
    status: 'ok',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    accounts: [
      {
        accountId: 'bank',
        accountName: 'Bank',
        kind: 'bank',
        balanceBefore: 0,
        balanceAfter: 60000,
        delta: 60000,
      },
      {
        accountId: 'card',
        accountName: 'Card',
        kind: 'card',
        balanceBefore: 5000,
        balanceAfter: 3000,
        delta: -2000,
      },
    ],
    missingAccounts: [],
    netChange: 62000,
    income: 100000,
    expenses: 27000,
    invested: 10000,
    explained: 63000,
    residual: -1000,
    ...overrides,
  })

  test('invested + banks + card paydown + unexplained adds up to the surplus', () => {
    const result = buildSavingsBreakdown(73000, bridge({}))
    expect(result).toMatchObject({
      status: 'ok',
      invested: 10000,
      bankChange: 60000,
      cardDuesReduced: 2000,
      unexplained: 1000,
    })
    expect(10000 + 60000 + 2000 + 1000).toBe(73000)
  })

  test('says which accounts are missing balances when insufficient', () => {
    const result = buildSavingsBreakdown(
      73000,
      bridge({
        status: 'insufficient',
        netChange: null,
        residual: null,
        missingAccounts: [{ accountId: 'card', accountName: 'Card' }],
      })
    )
    expect(result.status).toBe('insufficient')
    expect(result.bankChange).toBeNull()
    expect(result.missingAccounts).toEqual([{ accountId: 'card', accountName: 'Card' }])
  })
})

describe('collectPeriodWarnings', () => {
  const coverage = (overrides: Partial<AccountCoverage>): AccountCoverage => ({
    accountId: 'bank',
    accountName: 'HDFC Savings',
    type: 'savings_account',
    statementCount: 3,
    coveredFrom: '2026-01-01',
    coveredTo: '2026-10-05',
    daysSinceLastStatement: 10,
    isStale: false,
    gaps: [],
    overlaps: [],
    balanceBreaks: [],
    missingPeriod: [],
    reconciliation: [],
    ...overrides,
  })

  const health = (
    accountsCoverage: AccountCoverage[],
    items: DataHealthReport['cardPayments']['items'] = []
  ): Pick<DataHealthReport, 'accounts' | 'cardPayments'> => ({
    accounts: accountsCoverage,
    cardPayments: { count: items.length, total: 0, items, dismissed: [] },
  })

  test('nothing to report for healthy data', () => {
    expect(collectPeriodWarnings(health([coverage({})]), '2026-09-01', '2026-09-30')).toEqual({
      count: 0,
      items: [],
    })
  })

  test('only gaps and issues that touch the period are listed', () => {
    const result = collectPeriodWarnings(
      health(
        [
          coverage({
            gaps: [
              {
                from: '2026-09-05',
                to: '2026-09-12',
                days: 8,
                afterStatementId: 'a',
                beforeStatementId: 'b',
              },
              {
                from: '2026-03-01',
                to: '2026-03-10',
                days: 10,
                afterStatementId: 'c',
                beforeStatementId: 'd',
              },
            ],
          }),
        ],
        [
          {
            id: 't1',
            date: '2026-09-18',
            amount: 5000,
            summary: 'Card bill',
            accountId: 'bank',
            accountName: 'HDFC Savings',
            kind: 'unlinked_debit',
            type: 'debit',
            suggestion: null,
            dismissed: false,
          },
          {
            id: 't2',
            date: '2026-07-18',
            amount: 5000,
            summary: 'Card bill',
            accountId: 'bank',
            accountName: 'HDFC Savings',
            kind: 'unlinked_debit',
            type: 'debit',
            suggestion: null,
            dismissed: false,
          },
        ]
      ),
      '2026-09-01',
      '2026-09-30'
    )
    expect(result.count).toBe(2)
    expect(result.items[0]).toMatchObject({
      kind: 'missing_statements',
      accountName: 'HDFC Savings',
    })
    expect(result.items[0]!.message).toContain('5 Sep 2026')
    expect(result.items[1]).toMatchObject({ kind: 'unlinked_payment', amount: 5000 })
  })

  test('accounts whose statements stop before the end of the period are flagged', () => {
    const result = collectPeriodWarnings(
      health([coverage({ coveredTo: '2026-09-15' })]),
      '2026-09-01',
      '2026-09-30'
    )
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ kind: 'coverage' })
  })
})
