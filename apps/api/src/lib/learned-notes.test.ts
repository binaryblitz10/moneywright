import { describe, expect, test } from 'bun:test'
import { accuracyRate, findRecurringCredits, timestampMs } from './learned-notes'

const credit = (fingerprint: string, date: string, amount = 1000) => ({
  fingerprint,
  date,
  amount,
  description: `${fingerprint} credit`,
})

describe('findRecurringCredits', () => {
  test('needs three distinct months', () => {
    const rows = [
      credit('acme payroll', '2026-07-01', 100),
      credit('acme payroll', '2026-08-01', 200),
      credit('acme payroll', '2026-09-01', 300),
      credit('friend', '2026-09-01'),
      credit('friend', '2026-09-15'),
      credit('friend', '2026-09-20'),
    ]
    const result = findRecurringCredits(rows)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ fingerprint: 'acme payroll', months: 3, averageAmount: 200 })
  })

  test('ignores empty fingerprints', () => {
    const rows = ['2026-07-01', '2026-08-01', '2026-09-01'].map((d) => credit('', d))
    expect(findRecurringCredits(rows)).toEqual([])
  })
})

describe('timestampMs', () => {
  test('reads SQLite and ISO timestamps as UTC', () => {
    expect(timestampMs('2026-11-02 10:00:00')).toBe(Date.parse('2026-11-02T10:00:00Z'))
    expect(timestampMs('2026-11-02T10:00:00.000Z')).toBe(Date.parse('2026-11-02T10:00:00Z'))
    expect(timestampMs(null)).toBeNull()
  })
})

describe('accuracyRate', () => {
  test('is null below ten rows', () => {
    expect(accuracyRate(1, 5)).toBeNull()
  })
  test('subtracts the corrected share', () => {
    expect(accuracyRate(5, 45)).toBeCloseTo(0.9)
  })
})
