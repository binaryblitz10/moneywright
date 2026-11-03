import { describe, expect, test } from 'bun:test'
import { changedColumns, columnValue, makeFixId, recordValue, valuesMatch } from './values'

describe('valuesMatch', () => {
  test('matches when every recorded column still has its value', () => {
    expect(valuesMatch({ isHidden: true, notes: 'x', category: 'food' }, { isHidden: true })).toBe(
      true
    )
  })

  test('does not match once a recorded column was edited', () => {
    expect(valuesMatch({ category: 'shopping' }, { category: 'food' })).toBe(false)
  })

  test('treats missing and null as the same', () => {
    expect(valuesMatch({}, { linkedEntityId: null })).toBe(true)
  })

  test('compares decimals as numbers whatever the database returns', () => {
    expect(valuesMatch({ categoryConfidence: '0.80' }, { categoryConfidence: 0.8 })).toBe(true)
    expect(valuesMatch({ amount: 450 }, { amount: '450.00' })).toBe(true)
    expect(valuesMatch({ amount: '451.00' }, { amount: 450 })).toBe(false)
  })

  test('compares timestamps by their ISO form', () => {
    const date = new Date('2025-10-03T10:00:00.000Z')
    expect(valuesMatch({ updatedAt: date }, { updatedAt: date.toISOString() })).toBe(true)
  })
})

describe('changedColumns', () => {
  test('keeps only the columns that differ', () => {
    expect(
      changedColumns(
        { category: 'other', isHidden: false, notes: null },
        { category: 'food', isHidden: false, notes: null },
        ['category', 'isHidden', 'notes']
      )
    ).toEqual({ before: { category: 'other' }, after: { category: 'food' } })
  })

  test('returns null when nothing differs', () => {
    expect(changedColumns({ amount: '10.00' }, { amount: 10 }, ['amount'])).toBeNull()
  })
})

describe('recorded values', () => {
  test('round trip for Postgres and SQLite', () => {
    expect(recordValue('amount', '450.00')).toBe(450)
    expect(columnValue('amount', 450, true)).toBe('450')
    expect(columnValue('amount', 450, false)).toBe(450)
    expect(columnValue('createdAt', '2025-10-03T10:00:00.000Z', true)).toBeInstanceOf(Date)
    expect(columnValue('createdAt', '2025-10-03T10:00:00.000Z', false)).toBe(
      '2025-10-03T10:00:00.000Z'
    )
  })
})

describe('makeFixId', () => {
  test('is the same for the same finding', () => {
    expect(makeFixId('duplicates-sure', ['a', 'b'])).toBe(makeFixId('duplicates-sure', ['a', 'b']))
    expect(makeFixId('duplicates-sure', ['a', 'b'])).toBe('duplicates-sure:a+b')
  })
})
