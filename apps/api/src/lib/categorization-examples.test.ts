import { describe, expect, test } from 'bun:test'
import { buildMemory, type MemoryRow } from './categorization-memory'
import { formatCorrections, formatPastDecisions, selectExamples } from './categorization-examples'

function row(overrides: Partial<MemoryRow>): MemoryRow {
  return {
    fingerprint: 'swiggy',
    type: 'debit',
    category: 'food',
    name: 'Swiggy',
    isSubscription: false,
    categorySource: 'user',
    nameSource: 'user',
    confidence: 1,
    date: '2026-09-01',
    updatedAt: '2026-09-01 10:00:00',
    description: 'SWIGGY BANGALORE',
    ...overrides,
  }
}

const memory = buildMemory(
  [
    row({}),
    row({
      fingerprint: 'netflix',
      name: 'Netflix',
      category: 'entertainment',
      description: 'NETFLIX MUMBAI',
      categorySource: 'rule',
    }),
    row({
      fingerprint: 'salary',
      type: 'credit',
      name: 'Acme',
      category: 'salary',
      description: 'NEFT SALARY ACME',
    }),
  ],
  '2026-11-02'
)

describe('selectExamples', () => {
  test('picks overlapping entries of the same type only', () => {
    const picked = selectExamples(memory, [
      { id: '1', description: 'SWIGGY ORDER 99', type: 'debit' },
      { id: '2', description: 'SALARY ACME CORP', type: 'debit' },
    ])
    expect(picked.map((e) => e.fingerprint)).toEqual(['swiggy'])
  })

  test('returns nothing without overlap', () => {
    expect(
      selectExamples(memory, [{ id: '1', description: 'ZZZ UNKNOWN', type: 'debit' }])
    ).toEqual([])
  })
})

describe('formatPastDecisions', () => {
  test('labels the strongest source', () => {
    const text = formatPastDecisions([...memory.values()])
    expect(text).toContain('"SWIGGY BANGALORE" → Swiggy | food [you]')
    expect(text).toContain('"NETFLIX MUMBAI" → Netflix | entertainment [rule]')
  })

  test('shows the spread of mixed entries', () => {
    const mixed = buildMemory(
      [row({}), row({ category: 'groceries', categorySource: 'rule' })],
      '2026-11-02'
    )
    expect(formatPastDecisions([...mixed.values()])).toContain('(past: food×1, groceries×1)')
  })

  test('is empty when there is nothing', () => {
    expect(formatPastDecisions([])).toBe('')
  })
})

describe('formatCorrections', () => {
  test('dedupes by fingerprint and skips incomplete events', () => {
    const text = formatCorrections([
      { merchantFingerprint: 'a', description: 'SHOP A', fromValue: 'shopping', toValue: 'food' },
      { merchantFingerprint: 'a', description: 'SHOP A 2', fromValue: 'shopping', toValue: 'food' },
      { merchantFingerprint: 'b', description: 'SHOP B', fromValue: null, toValue: 'food' },
    ])
    expect(text).toBe('"SHOP A": AI said shopping → you chose food')
  })

  test('caps at 40 lines', () => {
    const events = Array.from({ length: 60 }, (_, i) => ({
      merchantFingerprint: `m${i}`,
      description: `SHOP ${i}`,
      fromValue: 'a',
      toValue: 'b',
    }))
    expect(formatCorrections(events).split('\n')).toHaveLength(40)
  })
})
