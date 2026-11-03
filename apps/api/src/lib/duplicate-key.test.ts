import { describe, expect, test } from 'bun:test'
import {
  clusterDuplicates,
  descriptionsMatch,
  duplicateKey,
  selectRowsToInsert,
} from './duplicate-key'

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

const select = (rows: Row[], present: Row[]) => selectRowsToInsert(rows, present, (r) => r)

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
    const result = select([a, b, c], [a, b, c])
    expect(result.toInsert).toEqual([])
    expect(result.skipped).toBe(3)
  })

  test('partial overlap inserts only the new rows', () => {
    const result = select([a, b, c], [a, b])
    expect(result.toInsert).toEqual([c])
    expect(result.skipped).toBe(2)
  })

  test('identical same-day rows in one file are kept when not already present', () => {
    const result = select([a, a], [])
    expect(result.toInsert).toHaveLength(2)
    expect(result.skipped).toBe(0)
  })

  test('inserts N - M of identical rows', () => {
    const result = select([a, a, a], [a])
    expect(result.toInsert).toHaveLength(2)
    expect(result.skipped).toBe(1)
  })

  test('different descriptions are not deduped', () => {
    const other = { ...a, description: 'Coffee Shop' }
    const result = select([other], [a])
    expect(result.toInsert).toEqual([other])
    expect(result.skipped).toBe(0)
  })

  test('different accounts are not deduped', () => {
    const other = { ...a, accountId: 'acc2' }
    const result = select([other], [a])
    expect(result.toInsert).toEqual([other])
    expect(result.skipped).toBe(0)
  })

  test('skips a row sharing a reference number within 3 days of an existing one', () => {
    const present: Row = { ...base, description: 'UPI/412345678901/Zomato' }
    const incoming: Row = { ...base, date: '2026-09-13', description: 'Zomato order 412345678901' }
    expect(select([incoming], [present])).toEqual({ toInsert: [], skipped: 1 })
    const late: Row = { ...incoming, date: '2026-09-14' }
    expect(select([late], [present]).toInsert).toEqual([late])
  })

  test('never skips a row whose reference conflicts with the existing one', () => {
    const present: Row = { ...base, description: 'UPI/412345678901/Zomato' }
    const incoming: Row = { ...base, description: 'UPI/412345678999/Zomato' }
    expect(select([incoming], [present])).toEqual({ toInsert: [incoming], skipped: 0 })
  })

  test('preserves file order of the rows that are kept', () => {
    const result = select([c, a, b], [a])
    expect(result.toInsert).toEqual([c, b])
  })
})

describe('descriptionsMatch', () => {
  test('matches a prefixed or trimmed form of the same description', () => {
    expect(
      descriptionsMatch(
        'MOBILE BANKING Sagar Sing MMT/IMPS/627417543590/Sagar Sing/UTIB0000015',
        'MMT/IMPS/627417543590/Sagar Sing/UTIB0000015'
      )
    ).toBe(true)
    expect(descriptionsMatch('UPI/Zomato/4455', 'upi-zomato-4455-ref99')).toBe(true)
  })

  test('does not match unrelated descriptions', () => {
    expect(descriptionsMatch('Tea Stall', 'Coffee Shop')).toBe(false)
    expect(descriptionsMatch('UPI/Zomato/4455', 'UPI/Swiggy/9981')).toBe(false)
    expect(descriptionsMatch('', 'Tea Stall')).toBe(false)
  })
})

describe('clusterDuplicates', () => {
  test('groups loosely matching rows and keeps others apart', () => {
    const rows: Row[] = [
      { ...base, description: 'IMPS/6274/Sagar' },
      { ...base, description: 'MOBILE BANKING IMPS/6274/Sagar' },
      { ...base, description: 'Coffee Shop' },
      { ...base, date: '2026-09-11', description: 'IMPS/6274/Sagar' },
    ]
    const clusters = [...clusterDuplicates(rows, (r) => r).values()]
    expect(clusters.map((c) => c.length)).toEqual([2, 1, 1])
  })
})
