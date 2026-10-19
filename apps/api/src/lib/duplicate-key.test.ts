import { describe, expect, test } from 'bun:test'
import { duplicateKey, selectRowsToInsert } from './duplicate-key'

const base = {
  accountId: 'acc1',
  date: '2026-09-10',
  type: 'debit',
  amount: 50,
  description: 'Tea Stall',
}

interface Row {
  accountId: string
  date: string
  type: string
  amount: number
  description: string
}

const keyOf = (r: Row): string => duplicateKey(r)

function counts(rows: Row[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const r of rows) map.set(keyOf(r), (map.get(keyOf(r)) ?? 0) + 1)
  return map
}

describe('duplicateKey', () => {
  test('ignores case, extra whitespace and sub-paisa amount noise', () => {
    const a = duplicateKey(base)
    const b = duplicateKey({ ...base, description: '  tea   STALL ', amount: 50.0004 })
    expect(b).toBe(a)
  })

  test('differs by account, date, type, amount and description', () => {
    const a = duplicateKey(base)
    expect(duplicateKey({ ...base, accountId: 'acc2' })).not.toBe(a)
    expect(duplicateKey({ ...base, date: '2026-09-11' })).not.toBe(a)
    expect(duplicateKey({ ...base, type: 'credit' })).not.toBe(a)
    expect(duplicateKey({ ...base, amount: 51 })).not.toBe(a)
    expect(duplicateKey({ ...base, description: 'Coffee' })).not.toBe(a)
  })
})

describe('selectRowsToInsert', () => {
  const a: Row = base
  const b: Row = { ...base, date: '2026-09-11', description: 'Bus' }
  const c: Row = { ...base, date: '2026-09-12', description: 'Lunch', amount: 200 }

  test('exact overlap inserts nothing', () => {
    const result = selectRowsToInsert([a, b, c], counts([a, b, c]), keyOf)
    expect(result.toInsert).toEqual([])
    expect(result.skipped).toBe(3)
  })

  test('partial overlap inserts only the new rows', () => {
    const result = selectRowsToInsert([a, b, c], counts([a, b]), keyOf)
    expect(result.toInsert).toEqual([c])
    expect(result.skipped).toBe(2)
  })

  test('identical same-day rows in one file are kept when not already present', () => {
    const result = selectRowsToInsert([a, a], new Map(), keyOf)
    expect(result.toInsert).toHaveLength(2)
    expect(result.skipped).toBe(0)
  })

  test('inserts N - M of identical rows', () => {
    const result = selectRowsToInsert([a, a, a], counts([a]), keyOf)
    expect(result.toInsert).toHaveLength(2)
    expect(result.skipped).toBe(1)
  })

  test('different descriptions are not deduped', () => {
    const other = { ...a, description: 'Coffee Shop' }
    const result = selectRowsToInsert([other], counts([a]), keyOf)
    expect(result.toInsert).toEqual([other])
    expect(result.skipped).toBe(0)
  })

  test('different accounts are not deduped', () => {
    const other = { ...a, accountId: 'acc2' }
    const result = selectRowsToInsert([other], counts([a]), keyOf)
    expect(result.toInsert).toEqual([other])
    expect(result.skipped).toBe(0)
  })

  test('preserves file order of the rows that are kept', () => {
    const result = selectRowsToInsert([c, a, b], counts([a]), keyOf)
    expect(result.toInsert).toEqual([c, b])
  })
})
