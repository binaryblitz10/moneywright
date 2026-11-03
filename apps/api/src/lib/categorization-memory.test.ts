import { describe, expect, test } from 'bun:test'
import {
  adjustConfidence,
  buildMemory,
  looseCore,
  looseMatches,
  lookupMemory,
  resolveFromMemory,
  topCategory,
  type MemoryRow,
} from './categorization-memory'

const TODAY = '2026-11-02'

function row(overrides: Partial<MemoryRow> = {}): MemoryRow {
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
    description: 'UPI/SWIGGY/123',
    ...overrides,
  }
}

describe('buildMemory', () => {
  test('keys by fingerprint and type and skips empty fingerprints', () => {
    const memory = buildMemory([row(), row({ type: 'credit' }), row({ fingerprint: '' })], TODAY)
    expect([...memory.keys()].sort()).toEqual(['swiggy|credit', 'swiggy|debit'])
  })

  test('weights user 3, rule 2 and old confident ai 1; memory and unknown 0', () => {
    const memory = buildMemory(
      [
        row({ categorySource: 'user' }),
        row({ categorySource: 'rule' }),
        row({ categorySource: 'ai', confidence: 0.9 }),
        row({ categorySource: 'memory' }),
        row({ categorySource: null }),
      ],
      TODAY
    )
    const entry = memory.get('swiggy|debit')!
    expect(entry.totalWeight).toBe(6)
    expect(entry.userVotes).toBe(1)
    expect(entry.strongestSource).toBe('user')
  })

  test('ai rows count only when confident and older than 14 days', () => {
    const memory = buildMemory(
      [
        row({ categorySource: 'ai', confidence: 0.7 }),
        row({ categorySource: 'ai', confidence: 0.95, date: '2026-10-25' }),
        row({ categorySource: 'ai', confidence: 0.95, date: '2026-10-01' }),
      ],
      TODAY
    )
    expect(memory.get('swiggy|debit')!.totalWeight).toBe(1)
  })

  test('name is the latest user name, else the most common trusted name', () => {
    const user = buildMemory(
      [
        row({ name: 'Old', updatedAt: '2026-01-01 00:00:00' }),
        row({ name: 'New', updatedAt: '2026-02-01 00:00:00' }),
        row({ name: 'Ai', nameSource: 'ai' }),
      ],
      TODAY
    )
    expect(user.get('swiggy|debit')!.name).toBe('New')

    const common = buildMemory(
      [
        row({ name: 'A', nameSource: 'ai' }),
        row({ name: 'B', nameSource: 'rule' }),
        row({ name: 'B', nameSource: 'ai' }),
        row({ name: 'Mem', nameSource: 'memory' }),
      ],
      TODAY
    )
    expect(common.get('swiggy|debit')!.name).toBe('B')
  })

  test('subscription is a weighted majority and the sample is the latest description', () => {
    const memory = buildMemory(
      [
        row({ isSubscription: true, categorySource: 'user' }),
        row({ isSubscription: false, categorySource: 'rule' }),
        row({ description: 'LATEST', updatedAt: new Date('2026-10-01') }),
      ],
      TODAY
    )
    const entry = memory.get('swiggy|debit')!
    expect(entry.isSubscription).toBe(false)
    expect(entry.sampleDescription).toBe('LATEST')
  })
})

describe('resolveFromMemory', () => {
  test('answers a settled merchant with user confidence', () => {
    const entry = buildMemory([row()], TODAY).get('swiggy|debit')!
    expect(resolveFromMemory(entry)).toEqual({
      category: 'food',
      name: 'Swiggy',
      isSubscription: false,
      confidence: 0.95,
    })
  })

  test('uses 0.85 when no user vote exists', () => {
    const entry = buildMemory(
      [row({ categorySource: 'rule' }), row({ categorySource: 'rule' })],
      TODAY
    ).get('swiggy|debit')!
    expect(resolveFromMemory(entry)?.confidence).toBe(0.85)
  })

  test('refuses weak weight, mixed votes and missing names', () => {
    expect(
      resolveFromMemory(buildMemory([row({ categorySource: 'rule' })], TODAY).get('swiggy|debit')!)
    ).toBeNull()
    const mixed = buildMemory(
      [row(), row({ category: 'groceries', categorySource: 'rule' })],
      TODAY
    )
    expect(resolveFromMemory(mixed.get('swiggy|debit')!)).toBeNull()
    const nameless = buildMemory([row({ name: null })], TODAY)
    expect(resolveFromMemory(nameless.get('swiggy|debit')!)).toBeNull()
  })
})

describe('topCategory and adjustConfidence', () => {
  const entry = buildMemory(
    [row(), row({ category: 'groceries', categorySource: 'rule' })],
    TODAY
  ).get('swiggy|debit')!

  test('top category share', () => {
    expect(topCategory(entry)).toEqual({ category: 'food', share: 0.6 })
  })

  test('disagreement caps and agreement raises confidence', () => {
    expect(adjustConfidence(entry, 'shopping', 0.95)).toBe(0.6)
    expect(adjustConfidence(entry, 'food', 0.7)).toBe(0.85)
  })

  test('unchanged without a trusted entry', () => {
    expect(adjustConfidence(undefined, 'food', 0.7)).toBe(0.7)
    const weak = buildMemory([row(), row({ category: 'a' }), row({ category: 'b' })], TODAY).get(
      'swiggy|debit'
    )!
    expect(adjustConfidence(weak, 'x', 0.9)).toBe(0.9)
  })
})

describe('loose matching', () => {
  const sagar = (fingerprint: string, overrides: Partial<MemoryRow> = {}): MemoryRow =>
    row({ fingerprint, category: 'transfers', name: 'Sagar Singh', ...overrides })

  test('looseCore drops bank words and spaces, and ignores upi ids', () => {
    expect(looseCore('axis sagar singh')).toBe('sagarsingh')
    expect(looseCore('sagarsingh axis')).toBe('sagarsingh')
    expect(looseCore('upi:sagar@okaxis')).toBe('')
  })

  test('looseMatches needs 6 chars and a shared prefix', () => {
    expect(looseMatches('sagar sing', 'sagar sin axis')).toBe(true)
    expect(looseMatches('sagar sing', 'sagar sing')).toBe(false)
    expect(looseMatches('sagar', 'sagar singh')).toBe(false)
    expect(looseMatches('ab cd', 'ab cd ef gh')).toBe(false)
    expect(looseMatches('upi:sagarsingh@x', 'upi:sagarsingh@x2')).toBe(false)
  })

  test('looseMatches accepts spacing differences and cuts inside a word only', () => {
    expect(looseMatches('sagarsingh', 'sagar singh')).toBe(true)
    expect(looseMatches('sagarsin', 'sagar singh')).toBe(true)
    expect(looseMatches('sagarsing', 'sagarsingh')).toBe(true)
    expect(looseMatches('amazon', 'amazon bd')).toBe(false)
    expect(looseMatches('zerodha broking', 'zerodha broking fees')).toBe(false)
  })

  test('the four sagar variants resolve loosely from the others', () => {
    const variants = ['sagar sing', 'sagarsingh axis', 'sagar sin axis', 'axis sagar singh']
    for (const asked of variants) {
      const rows = variants
        .filter((v) => v !== asked)
        .flatMap((v) => [sagar(v), sagar(v, { date: '2026-09-02' })])
      const found = lookupMemory(buildMemory(rows, TODAY), asked, 'debit')
      expect(found?.match).toBe('loose')
      expect(found?.resolved.category).toBe('transfers')
      expect(found?.resolved.name).toBe('Sagar Singh')
      expect(found?.resolved.confidence).toBe(0.8)
    }
  })

  test('a different person with another category blocks the answer', () => {
    const rows = [
      sagar('sagar sing'),
      sagar('sagar sing', { date: '2026-09-02' }),
      sagar('sagar sin axis'),
      sagar('sagar sinha', { category: 'rent', name: 'Sagar Sinha' }),
    ]
    expect(lookupMemory(buildMemory(rows, TODAY), 'sagar sin', 'debit')).toBeNull()
  })

  test('disagreeing names without a user vote do not answer', () => {
    const rows = [
      sagar('sagar sing', { categorySource: 'rule', nameSource: 'rule', name: 'Sagar S' }),
      sagar('sagar sin axis', { categorySource: 'rule', nameSource: 'rule' }),
    ].flatMap((r) => [r, { ...r, date: '2026-09-02' }])
    expect(lookupMemory(buildMemory(rows, TODAY), 'sagarsingh axis', 'debit')).toBeNull()
  })

  test('cores under 6 chars never match', () => {
    const rows = ['abcdef gh'].flatMap((f) => [
      row({ fingerprint: f }),
      row({ fingerprint: f, date: '2026-09-02' }),
    ])
    expect(lookupMemory(buildMemory(rows, TODAY), 'abcde', 'debit')).toBeNull()
  })

  test('upi fingerprints never match loosely', () => {
    const rows = [1, 2, 3].map((d) =>
      row({ fingerprint: 'upi:sagarsingh@okaxis', date: `2026-09-0${d}` })
    )
    expect(lookupMemory(buildMemory(rows, TODAY), 'upi:sagarsingh@okaxis2', 'debit')).toBeNull()
  })

  test('an exact match wins and reports exact', () => {
    const rows = [
      ...[1, 2].map((d) => sagar('sagar singh', { category: 'rent', date: `2026-09-0${d}` })),
      ...[1, 2].map((d) => sagar('sagar sing', { date: `2026-09-0${d}` })),
    ]
    const found = lookupMemory(buildMemory(rows, TODAY), 'sagar singh', 'debit')
    expect(found?.match).toBe('exact')
    expect(found?.resolved.category).toBe('rent')
  })
})
