import { describe, expect, test } from 'bun:test'
import { findSuspects, isOverlapBreak, truncate, type TxnCandidate } from './data-health-summary'

const row = (over: Partial<TxnCandidate>): TxnCandidate => ({
  id: 'a',
  date: '2026-09-10',
  type: 'debit',
  amount: 450,
  description: 'SWIGGY',
  source: 'statement',
  ...over,
})

describe('findSuspects', () => {
  test('matches the difference inside the period and flags other-source neighbours', () => {
    const rows = [
      row({ id: 'a' }),
      row({ id: 'b', date: '2026-09-11', source: 'bank_message' }),
      row({ id: 'c', amount: 99 }),
      row({ id: 'd', date: '2026-10-20' }),
    ]
    const suspects = findSuspects(rows, '2026-09-01', '2026-09-30', -450)
    expect(suspects.map((s) => s.id)).toEqual(['a', 'b'])
    expect(suspects.every((s) => s.likelyDuplicate)).toBe(true)
  })

  test('does not flag a lone match', () => {
    const suspects = findSuspects([row({})], '2026-09-01', '2026-09-30', 450)
    expect(suspects[0]?.likelyDuplicate).toBe(false)
  })
})

describe('isOverlapBreak', () => {
  const brk = {
    afterDate: '2026-09-30',
    previousStatementId: 's1',
    nextStatementId: 's2',
    previousClosing: 1,
    nextOpening: 2,
    difference: 1,
  }
  test('detects overlapping statements', () => {
    const overlaps = [
      { from: 'x', to: 'y', days: 3, statementIds: ['s1', 's2'] as [string, string] },
    ]
    expect(isOverlapBreak(brk, overlaps)).toBe(true)
    expect(isOverlapBreak(brk, [])).toBe(false)
  })
})

describe('truncate', () => {
  test('shortens long text', () => {
    expect(truncate('x'.repeat(100)).length).toBe(80)
    expect(truncate('short')).toBe('short')
  })
})
