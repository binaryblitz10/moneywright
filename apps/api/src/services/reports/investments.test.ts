import { describe, expect, test } from 'bun:test'
import {
  computeInvestments,
  containsWord,
  matchSource,
  type ReportHolding,
  type ReportSource,
} from './investments'
import { resolvePeriod, type ReportTransaction } from './shared'

function txn(
  date: string,
  amount: number,
  summary: string,
  type: 'credit' | 'debit' = 'debit'
): ReportTransaction {
  return {
    date,
    type,
    amount,
    category: 'investment',
    accountId: 'bank',
    summary,
    originalDescription: `UPI-${summary.toUpperCase()}`,
  }
}

const sources: ReportSource[] = [
  { id: 's1', sourceType: 'zerodha', sourceName: 'Zerodha - Kite', institution: null },
  { id: 's2', sourceType: 'groww', sourceName: 'Groww', institution: 'Nextbillion' },
  { id: 's3', sourceType: 'other', sourceName: 'Other', institution: null },
]

describe('containsWord / matchSource', () => {
  test('matches whole words only, ignoring case', () => {
    expect(containsWord('UPI-ZERODHA BROKING', 'zerodha')).toBe(true)
    expect(containsWord('Angel One Ltd', 'Angel One')).toBe(true)
    expect(containsWord('Growwth Fund', 'Groww')).toBe(false)
    expect(containsWord('C++ shop', 'C++')).toBe(true)
  })

  test('finds the source by platform label, source name or institution', () => {
    expect(matchSource(['Zerodha Broking'], sources)?.id).toBe('s1')
    expect(matchSource(['Payment to nextbillion'], sources)?.id).toBe('s2')
    expect(matchSource(['Random SIP'], sources)).toBeNull()
  })

  test('generic source types never match', () => {
    expect(matchSource(['Other income'], sources)).toBeNull()
  })
})

describe('computeInvestments', () => {
  const holdings: ReportHolding[] = [
    {
      sourceId: 's1',
      investmentType: 'stock',
      currentValue: 150000,
      investedValue: 100000,
      asOfDate: '2026-10-01',
    },
    {
      sourceId: 's1',
      investmentType: 'mutual_fund',
      currentValue: 50000,
      investedValue: null,
      asOfDate: '2026-09-20',
    },
    {
      sourceId: 's2',
      investmentType: 'mutual_fund',
      currentValue: 30000,
      investedValue: 25000,
      asOfDate: '2026-09-15',
    },
    {
      sourceId: null,
      investmentType: 'gold',
      currentValue: 20000,
      investedValue: 20000,
      asOfDate: '2026-08-01',
    },
  ]
  const transactions = [
    txn('2026-09-05', 10000, 'Zerodha'),
    txn('2026-09-06', 2000, 'Zerodha', 'credit'),
    txn('2026-08-05', 6000, 'Zerodha'),
    txn('2026-01-05', 4000, 'Zerodha'),
    txn('2026-09-15', 3000, 'Mystery SIP'),
    txn('2026-08-15', 1000, 'Mystery SIP'),
  ]
  const period = resolvePeriod('2026-09', '2026-09', '2026-01')
  const result = computeInvestments({
    transactions,
    period,
    sources,
    holdings,
  })

  test('totals put in, taken out and net, with the comparison', () => {
    expect(result.totals.current).toEqual({ putIn: 13000, takenOut: 2000, net: 11000, count: 3 })
    expect(result.totals.previous).toEqual({ putIn: 7000, takenOut: 0, net: 7000, count: 2 })
    expect(result.totals.putInChange?.delta).toBe(6000)
    expect(result.byMonth).toEqual([{ month: '2026-09', putIn: 13000, takenOut: 2000, net: 11000 }])
  })

  test('platform rows combine payments with holdings', () => {
    expect(result.platforms.map((p) => p.sourceId)).toEqual(['s1', 's2'])
    expect(result.platforms[0]).toMatchObject({
      putIn: 10000,
      takenOut: 2000,
      previousPutIn: 6000,
      netSinceStart: 18000,
      currentValue: 200000,
      cost: 100000,
      gain: 50000,
      gainPct: 0.5,
      asOfDate: '2026-10-01',
      holdingsCount: 2,
    })
  })

  test('a platform with holdings but no payments still gets a row', () => {
    expect(result.platforms[1]).toMatchObject({
      putIn: 0,
      netSinceStart: 0,
      currentValue: 30000,
      gain: 5000,
    })
  })

  test('unmatched payments stay out of the rows but in the totals and the note', () => {
    expect(result.unmatched).toEqual({ putIn: 3000, takenOut: 0, count: 1 })
    const rowPutIn = result.platforms.reduce((s, p) => s + p.putIn, 0)
    expect(rowPutIn + result.unmatched.putIn).toBe(result.totals.current.putIn)
  })

  test('allocation and overall figures use all holdings', () => {
    expect(result.overall).toMatchObject({
      currentValue: 250000,
      cost: 145000,
      gain: 55000,
      holdingsCount: 4,
    })
    expect(result.allocation[0]).toMatchObject({ type: 'stock', label: 'Stock', value: 150000 })
    expect(result.allocation.reduce((s, a) => s + a.share, 0)).toBeCloseTo(1)
  })

  test('no comparison when the period has none', () => {
    const early = computeInvestments({
      transactions,
      period: resolvePeriod('2026-09', '2026-09', '2026-09'),
      sources,
      holdings: [],
    })
    expect(early.totals.previous).toBeNull()
    expect(early.totals.putInChange).toBeNull()
    expect(early.platforms[0]!.previousPutIn).toBeNull()
  })

  test('a source with payments but no holdings has no value figures', () => {
    const noHoldings = computeInvestments({
      transactions,
      period,
      sources,
      holdings: [],
    })
    expect(noHoldings.platforms[0]).toMatchObject({
      currentValue: null,
      gain: null,
      asOfDate: null,
    })
  })
})
