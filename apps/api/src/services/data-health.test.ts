import { describe, expect, test } from 'bun:test'
import {
  computeBalanceAt,
  findBalanceBreaks,
  findGapsAndOverlaps,
  findMissingPeriods,
  findUnlinkedCardPayments,
  financialYearStart,
  reconcileStatement,
  resolveStatementPeriods,
  type RawStatement,
  type StatementLite,
  type TxnLite,
} from './data-health'

function stmt(
  id: string,
  periodStart: string,
  periodEnd: string,
  openingBalance: number | null = null,
  closingBalance: number | null = null
): StatementLite {
  return {
    id,
    accountId: 'a1',
    periodStart,
    periodEnd,
    periodInferred: false,
    openingBalance,
    closingBalance,
    deletedTransactionCount: 0,
    filename: `${id}.pdf`,
  }
}

function txn(
  id: string,
  accountId: string,
  date: string,
  type: 'credit' | 'debit',
  amount: number,
  category = 'transfer'
): TxnLite {
  return {
    id,
    accountId,
    statementId: null,
    date,
    type,
    amount,
    category,
    summary: null,
    isHidden: false,
    linkedEntityId: null,
  }
}

describe('findGapsAndOverlaps', () => {
  test('contiguous statements have neither', () => {
    const result = findGapsAndOverlaps([
      stmt('s1', '2026-01-01', '2026-01-31'),
      stmt('s2', '2026-02-01', '2026-02-28'),
    ])
    expect(result.gaps).toEqual([])
    expect(result.overlaps).toEqual([])
  })

  test('reports the uncovered days between statements', () => {
    const { gaps } = findGapsAndOverlaps([
      stmt('s2', '2026-03-01', '2026-03-31'),
      stmt('s1', '2026-01-01', '2026-01-31'),
    ])
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toMatchObject({ from: '2026-02-01', to: '2026-02-28', days: 28 })
  })

  test('reports overlapping days', () => {
    const { overlaps, gaps } = findGapsAndOverlaps([
      stmt('s1', '2026-01-01', '2026-01-31'),
      stmt('s2', '2026-01-25', '2026-02-28'),
    ])
    expect(gaps).toEqual([])
    expect(overlaps[0]).toMatchObject({ from: '2026-01-25', to: '2026-01-31', days: 7 })
  })

  test('a statement nested inside a longer one is not a gap', () => {
    const { gaps, overlaps } = findGapsAndOverlaps([
      stmt('s1', '2026-01-01', '2026-03-31'),
      stmt('s2', '2026-02-01', '2026-02-28'),
      stmt('s3', '2026-04-01', '2026-04-30'),
    ])
    expect(gaps).toEqual([])
    expect(overlaps).toHaveLength(1)
  })
})

describe('findBalanceBreaks', () => {
  test('flags differences over 1 rupee only', () => {
    const breaks = findBalanceBreaks([
      stmt('s1', '2026-01-01', '2026-01-31', 0, 1000),
      stmt('s2', '2026-02-01', '2026-02-28', 1000.5, 2000),
      stmt('s3', '2026-03-01', '2026-03-31', 2500, 3000),
    ])
    expect(breaks).toHaveLength(1)
    expect(breaks[0]).toMatchObject({
      previousStatementId: 's2',
      nextStatementId: 's3',
      difference: 500,
    })
  })

  test('skips pairs with a missing balance', () => {
    expect(
      findBalanceBreaks([
        stmt('s1', '2026-01-01', '2026-01-31', 0, null),
        stmt('s2', '2026-02-01', '2026-02-28', 9, 9),
      ])
    ).toEqual([])
  })
})

describe('reconcileStatement', () => {
  const txns = [
    { type: 'credit' as const, amount: 1000 },
    { type: 'debit' as const, amount: 300 },
  ]

  test('bank: opening + credits - debits', () => {
    const ok = reconcileStatement('bank', stmt('s', '2026-01-01', '2026-01-31', 500, 1200), txns)
    expect(ok.status).toBe('ok')
    expect(ok.expectedClosing).toBe(1200)
    const bad = reconcileStatement('bank', stmt('s', '2026-01-01', '2026-01-31', 500, 1000), txns)
    expect(bad.status).toBe('mismatch')
    expect(bad.difference).toBe(-200)
  })

  test('card: opening + debits - credits (amount owed)', () => {
    const result = reconcileStatement(
      'card',
      stmt('s', '2026-01-01', '2026-01-31', 1500, 800),
      txns
    )
    expect(result.expectedClosing).toBe(1500 + 300 - 1000)
    expect(result.status).toBe('ok')
  })

  test('missing balance is unverifiable', () => {
    expect(
      reconcileStatement('bank', stmt('s', '2026-01-01', '2026-01-31', null, 10), txns).status
    ).toBe('unverifiable')
  })

  test('card statement without an opening balance starts from 0', () => {
    const result = reconcileStatement('card', stmt('s', '2026-01-01', '2026-01-31', null, 1031), [
      txn('a', 'a1', '2026-01-05', 'debit', 149),
      txn('b', 'a1', '2026-01-09', 'debit', 882),
    ])
    expect(result.status).toBe('ok')
  })
})

describe('computeBalanceAt', () => {
  const statements = [
    stmt('s1', '2026-01-01', '2026-01-31', 1000, 1500),
    stmt('s2', '2026-02-01', '2026-02-28', 1500, 1800),
  ]
  const txns = [
    { date: '2026-01-10', type: 'credit' as const, amount: 500 },
    { date: '2026-02-05', type: 'credit' as const, amount: 400 },
    { date: '2026-02-20', type: 'debit' as const, amount: 100 },
    { date: '2026-03-05', type: 'debit' as const, amount: 50 },
  ]

  test('uses the closing balance of the last statement ending on or before the date', () => {
    expect(computeBalanceAt('bank', statements, txns, '2026-02-28')).toBe(1800)
  })

  test('rolls forward transactions after the statement', () => {
    expect(computeBalanceAt('bank', statements, txns, '2026-03-10')).toBe(1750)
    expect(computeBalanceAt('bank', statements, txns, '2026-02-10')).toBe(1500 + 400)
  })

  test('falls back to the opening balance of the containing statement', () => {
    expect(computeBalanceAt('bank', statements, txns, '2026-01-15')).toBe(1500)
    expect(computeBalanceAt('bank', statements, txns, '2025-12-31')).toBe(1000)
  })

  test('card balances move the other way', () => {
    expect(computeBalanceAt('card', statements, txns, '2026-03-10')).toBe(1800 + 50)
  })

  test('a new card with no opening line on its first statement starts from 0', () => {
    const newCard = [stmt('c1', '2025-11-17', '2026-10-15', null, 1031)]
    const spend = [{ date: '2026-10-05', type: 'debit' as const, amount: 1031 }]
    expect(computeBalanceAt('card', newCard, spend, '2026-03-31')).toBe(0)
    expect(computeBalanceAt('card', newCard, spend, '2026-10-10')).toBe(1031)
  })

  test('a missing opening line is unknown for a bank, or for a later card statement', () => {
    expect(
      computeBalanceAt('bank', [stmt('b1', '2026-01-01', '2026-01-31', null, 10)], [], '2026-01-15')
    ).toBeNull()
    const later = [
      stmt('c1', '2026-01-01', '2026-01-31', 0, 100),
      stmt('c2', '2026-02-01', '2026-02-28'),
    ]
    expect(computeBalanceAt('card', later, [], '2026-02-10')).toBe(100)
  })

  test('unknown when no statement covers the date', () => {
    expect(computeBalanceAt('bank', statements, txns, '2025-06-01')).toBeNull()
    expect(computeBalanceAt('bank', [], txns, '2026-03-01')).toBeNull()
  })
})

describe('financialYearStart', () => {
  test('rolls back before April', () => {
    expect(financialYearStart('2026-10-17')).toBe('2026-04-01')
    expect(financialYearStart('2026-02-01')).toBe('2025-04-01')
  })
})

describe('findUnlinkedCardPayments', () => {
  const payment = (id: string, linkedEntityId: string | null = null): TxnLite => ({
    ...txn(id, 'bank', '2026-01-10', 'debit', 5000, 'credit_card_payment'),
    linkedEntityId,
  })
  const banks = new Set(['bank'])

  test('flags a payment with no link on either side', () => {
    expect(findUnlinkedCardPayments([payment('p1')], banks, new Set()).map((t) => t.id)).toEqual([
      'p1',
    ])
  })

  test('a payment with its own link is linked', () => {
    expect(findUnlinkedCardPayments([payment('p1', 'c1')], banks, new Set())).toEqual([])
  })

  test('a payment the card-side credit links to is linked', () => {
    const result = findUnlinkedCardPayments([payment('p1'), payment('p2')], banks, new Set(['p1']))
    expect(result.map((t) => t.id)).toEqual(['p2'])
  })

  test('ignores credits, hidden rows and non-bank accounts', () => {
    const card = { ...payment('p3'), accountId: 'card' }
    const hidden = { ...payment('p4'), isHidden: true }
    const credit = { ...payment('p5'), type: 'credit' as const }
    expect(findUnlinkedCardPayments([card, hidden, credit], banks, new Set())).toEqual([])
  })
})

describe('resolveStatementPeriods', () => {
  function raw(
    id: string,
    periodStart: string | null,
    periodEnd: string | null,
    openingBalance: number | null = null,
    closingBalance: number | null = null
  ): RawStatement {
    return {
      id,
      accountId: 'a1',
      periodStart,
      periodEnd,
      openingBalance,
      closingBalance,
      deletedTransactionCount: 0,
      filename: `${id}.pdf`,
    }
  }

  test('stored periods are kept and not marked inferred', () => {
    const [s] = resolveStatementPeriods([raw('s1', '2026-01-01', '2026-01-31')], new Map())
    expect(s).toMatchObject({ periodStart: '2026-01-01', periodEnd: '2026-01-31' })
    expect(s!.periodInferred).toBe(false)
  })

  test('infers the period from the transaction dates and orders by them', () => {
    const dates = new Map([
      ['feb', ['2026-02-03', '2026-02-27']],
      ['jan', ['2026-01-04', '2026-01-30', '2026-01-15']],
    ])
    const result = resolveStatementPeriods(
      [raw('feb', null, null, 100, 200), raw('jan', null, null, 0, 100)],
      dates
    )
    expect(result.map((s) => s.id)).toEqual(['jan', 'feb'])
    expect(result[0]).toMatchObject({ periodStart: '2026-01-04', periodEnd: '2026-01-30' })
    expect(result.every((s) => s.periodInferred)).toBe(true)
  })

  test('stretches inferred ends over a gap when the balances chain', () => {
    const dates = new Map([
      ['jan', ['2026-01-04', '2026-01-28']],
      ['feb', ['2026-02-03', '2026-02-27']],
    ])
    const chained = resolveStatementPeriods(
      [raw('jan', null, null, 0, 100), raw('feb', null, null, 100, 200)],
      dates
    )
    expect(findGapsAndOverlaps(chained).gaps).toEqual([])
    expect(chained[1]!.periodStart).toBe('2026-01-29')

    const broken = resolveStatementPeriods(
      [raw('jan', null, null, 0, 100), raw('feb', null, null, 500, 600)],
      dates
    )
    expect(findGapsAndOverlaps(broken).gaps).toHaveLength(1)
  })

  test('keeps a stored start and infers only the missing end', () => {
    const [s] = resolveStatementPeriods(
      [raw('s1', '2026-01-01', null)],
      new Map([['s1', ['2026-01-05', '2026-01-29']]])
    )
    expect(s).toMatchObject({ periodStart: '2026-01-01', periodEnd: '2026-01-29' })
    expect(s!.periodInferred).toBe(true)
  })

  test('a statement with no dates or transactions falls back to neighbours via the balance chain', () => {
    const dates = new Map([
      ['a', ['2026-01-02', '2026-01-31']],
      ['c', ['2026-03-01', '2026-03-30']],
    ])
    const result = resolveStatementPeriods(
      [
        raw('c', null, null, 200, 300),
        raw('b', null, null, 100, 200),
        raw('a', null, null, 0, 100),
      ],
      dates
    )
    expect(result.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(result[1]).toMatchObject({ periodStart: '2026-02-01', periodEnd: '2026-02-28' })
    expect(findGapsAndOverlaps(result).gaps).toEqual([])
  })

  test('drops a statement whose period cannot be derived but still reports it', () => {
    const list = [raw('x', null, null, 5, 6)]
    const resolved = resolveStatementPeriods(list, new Map())
    expect(resolved).toEqual([])
    expect(findMissingPeriods(list, resolved)).toEqual([
      { statementId: 'x', filename: 'x.pdf', periodStart: null, periodEnd: null },
    ])
  })

  test('findMissingPeriods lists only statements with a missing date', () => {
    const list = [raw('ok', '2026-01-01', '2026-01-31'), raw('half', null, '2026-02-28')]
    const resolved = resolveStatementPeriods(list, new Map([['half', ['2026-02-02']]]))
    const missing = findMissingPeriods(list, resolved)
    expect(missing).toEqual([
      {
        statementId: 'half',
        filename: 'half.pdf',
        periodStart: '2026-02-02',
        periodEnd: '2026-02-28',
      },
    ])
  })

  test('an inferred Amex-style chain gives a computable balance', () => {
    const dates = new Map([
      ['s1', ['2026-01-04', '2026-01-28']],
      ['s2', ['2026-02-03', '2026-02-27']],
    ])
    const resolved = resolveStatementPeriods(
      [raw('s1', null, null, 0, 100), raw('s2', null, null, 100, 250)],
      dates
    )
    expect(computeBalanceAt('card', resolved, [], '2026-02-27')).toBe(250)
    expect(computeBalanceAt('card', resolved, [], '2026-01-03')).toBe(0)
  })
})
