import { describe, expect, test } from 'bun:test'
import {
  computeBalanceAt,
  findBalanceBreaks,
  findGapsAndOverlaps,
  findMissingPeriods,
  findCardPaymentChecks,
  suggestCardPaymentLink,
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
    skippedDuplicateCount: 0,
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
    description: '',
    isHidden: false,
    linkedEntityId: null,
    linkedEntityType: null,
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

describe('findCardPaymentChecks', () => {
  const bank = new Set(['bank'])
  const card = new Set(['card'])
  const statements = [{ accountId: 'bank', periodStart: '2026-01-01', periodEnd: '2026-01-31' }]

  const debit = (id: string, over: Partial<TxnLite> = {}): TxnLite => ({
    ...txn(id, 'bank', '2026-01-10', 'debit', 5000, 'credit_card_payment'),
    ...over,
  })
  const credit = (id: string, over: Partial<TxnLite> = {}): TxnLite => ({
    ...txn(id, 'card', '2026-01-11', 'credit', 5000, 'credit_card_payment'),
    ...over,
  })
  const run = (txns: TxnLite[], pointedAt: string[] = [], periods = statements) =>
    findCardPaymentChecks({
      txns,
      byId: new Map(txns.map((t) => [t.id, t])),
      bankAccountIds: bank,
      cardAccountIds: card,
      pointedAt: new Set(pointedAt),
      bankStatements: periods,
    }).map((f) => `${f.txn.id}:${f.kind}`)

  test('flags a bank debit with no link on either side', () => {
    expect(run([debit('p1')])).toEqual(['p1:unlinked_debit'])
  })

  test('a debit attached to a card, or pointed at by a card credit, is linked', () => {
    const attached = debit('p1', { linkedEntityId: 'card', linkedEntityType: 'credit_card' })
    expect(run([attached])).toEqual([])
    expect(run([debit('p2')], ['p2'])).toEqual([])
  })

  test('ignores hidden rows and debits in other categories', () => {
    expect(run([debit('p1', { isHidden: true }), debit('p2', { category: 'shopping' })])).toEqual(
      []
    )
  })

  test('flags a payment-like card credit only when a bank statement covers its date', () => {
    expect(run([credit('c1')])).toEqual(['c1:card_credit_without_bank'])
    expect(run([credit('c1', { date: '2026-02-03' })])).toEqual([])
    expect(run([credit('c1')], [], [])).toEqual([])
  })

  test('a statement of another kind of account does not count as bank coverage', () => {
    const cardStatement = [
      { accountId: 'card', periodStart: '2026-01-01', periodEnd: '2026-01-31' },
    ]
    expect(run([credit('c1')], [], cardStatement)).toEqual([])
  })

  test('card credits that are refunds or already linked are not flagged', () => {
    const refund = credit('c1', { category: 'refund', description: 'payment received' })
    const linked = credit('c2', { linkedEntityId: 'p1', linkedEntityType: 'transaction' })
    const d = debit('p1', { linkedEntityId: 'card', linkedEntityType: 'credit_card' })
    expect(run([refund, linked, d])).toEqual([])
  })

  test('flags a credit whose debit does not point back, or is gone', () => {
    const c = credit('c1', { linkedEntityId: 'p1', linkedEntityType: 'transaction' })
    expect(run([c, debit('p1')], ['p1'])).toEqual(['c1:broken_link'])
    expect(
      run([c, debit('p1', { linkedEntityId: 'other-card', linkedEntityType: 'credit_card' })])
    ).toEqual(['c1:broken_link'])
    expect(run([c])).toEqual(['c1:broken_link'])
  })
})

describe('suggestCardPaymentLink', () => {
  const bank = new Set(['bank'])
  const card = new Set(['card'])
  const names = new Map([
    ['bank', 'HDFC Savings'],
    ['card', 'HDFC Regalia'],
  ])
  const debit = (id: string, date: string, amount: number): TxnLite =>
    txn(id, 'bank', date, 'debit', amount, 'credit_card_payment')
  const credit = (id: string, date: string, amount: number): TxnLite => ({
    ...txn(id, 'card', date, 'credit', amount, 'credit_card_payment'),
    summary: 'Payment received',
  })
  const suggest = (
    txns: TxnLite[],
    id: string,
    kind: 'unlinked_debit' | 'card_credit_without_bank'
  ) =>
    suggestCardPaymentLink({
      check: { txn: txns.find((t) => t.id === id)!, kind },
      txns,
      bankAccountIds: bank,
      cardAccountIds: card,
      cards: [
        {
          id: 'card',
          name: 'HDFC Regalia',
          last4: null,
          institutionTerms: [],
          latestBalance: null,
        },
      ],
      nameById: names,
      institutionTermsById: new Map(),
    })

  test('a debit gets the one exact card credit near it', () => {
    const txns = [debit('d', '2026-01-10', 5000), credit('c', '2026-01-11', 5000)]
    expect(suggest(txns, 'd', 'unlinked_debit')).toMatchObject({
      kind: 'transaction',
      transactionId: 'c',
      accountName: 'HDFC Regalia',
    })
  })

  test('a card credit gets the bank debit, ignoring one already paired with another credit', () => {
    const paired = {
      ...credit('other', '2026-01-10', 5000),
      linkedEntityId: 'd1',
      linkedEntityType: 'transaction',
    }
    const txns = [
      debit('d1', '2026-01-10', 5000),
      debit('d2', '2026-01-12', 5000),
      paired,
      credit('c', '2026-01-11', 5000),
    ]
    expect(suggest(txns, 'c', 'card_credit_without_bank')).toMatchObject({
      kind: 'transaction',
      transactionId: 'd2',
    })
  })

  test('several close candidates leave the choice to the user', () => {
    const txns = [
      debit('d', '2026-01-10', 5000),
      credit('c1', '2026-01-10', 5000),
      credit('c2', '2026-01-11', 5000),
    ]
    expect(suggest(txns, 'd', 'unlinked_debit')).toBeNull()
  })

  test('with no credit around, a debit falls back to the card it paid', () => {
    expect(suggest([debit('d', '2026-01-10', 5000)], 'd', 'unlinked_debit')).toEqual({
      kind: 'card',
      accountId: 'card',
      accountName: 'HDFC Regalia',
      reason: 'Only card you have',
    })
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
      skippedDuplicateCount: 0,
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
