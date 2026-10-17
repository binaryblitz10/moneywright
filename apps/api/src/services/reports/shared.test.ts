import { describe, expect, test } from 'bun:test'
import {
  changeBetween,
  compareGroups,
  lastCompleteMonth,
  monthsBetween,
  resolvePeriod,
  validateMonthRange,
} from './shared'

describe('monthsBetween', () => {
  test('lists months across a year boundary', () => {
    expect(monthsBetween('2025-11', '2026-02')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ])
    expect(monthsBetween('2026-09', '2026-09')).toEqual(['2026-09'])
  })
})

describe('lastCompleteMonth', () => {
  test('is the month before today', () => {
    expect(lastCompleteMonth('2026-10-17')).toBe('2026-09')
    expect(lastCompleteMonth('2026-01-01')).toBe('2025-12')
  })
})

describe('resolvePeriod', () => {
  test('compares with the same number of months just before', () => {
    const period = resolvePeriod('2026-07', '2026-09', '2026-01')
    expect(period.startDate).toBe('2026-07-01')
    expect(period.endDate).toBe('2026-09-30')
    expect(period.comparison).toMatchObject({
      from: '2026-04',
      to: '2026-06',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
      months: ['2026-04', '2026-05', '2026-06'],
    })
  })

  test('a single month compares with the month before, across years', () => {
    expect(resolvePeriod('2026-01', '2026-01', '2025-01').comparison).toMatchObject({
      from: '2025-12',
      to: '2025-12',
    })
  })

  test('no comparison when it would start before the data does', () => {
    expect(resolvePeriod('2026-07', '2026-09', '2026-05').comparison).toBeNull()
    expect(resolvePeriod('2026-07', '2026-09', null).comparison).toBeNull()
  })

  test('comparison may start exactly on the first data month', () => {
    expect(resolvePeriod('2026-07', '2026-09', '2026-04').comparison?.from).toBe('2026-04')
  })
})

describe('validateMonthRange', () => {
  const bounds = { earliestMonth: '2026-03', lastCompleteMonth: '2026-09' }

  test('accepts a range inside the bounds', () => {
    expect(validateMonthRange('2026-03', '2026-09', bounds)).toBeNull()
  })

  test('rejects reversed ranges, the unfinished month and months before the data', () => {
    expect(validateMonthRange('2026-06', '2026-05', bounds)).not.toBeNull()
    expect(validateMonthRange('2026-08', '2026-10', bounds)).not.toBeNull()
    expect(validateMonthRange('2026-02', '2026-04', bounds)).not.toBeNull()
  })

  test('rejects everything without data', () => {
    expect(
      validateMonthRange('2026-01', '2026-01', {
        earliestMonth: null,
        lastCompleteMonth: '2026-09',
      })
    ).not.toBeNull()
  })
})

describe('changeBetween', () => {
  test('percentage is a fraction of the previous value', () => {
    expect(changeBetween(200, 250)).toEqual({ delta: 50, deltaPct: 0.25 })
  })

  test('no percentage against zero', () => {
    expect(changeBetween(0, 100)).toEqual({ delta: 100, deltaPct: null })
  })
})

describe('compareGroups', () => {
  const group = (key: string, total: number, count = 1) => ({ key, label: key, total, count })

  test('sorts by current, keeps groups that only existed before, flags new ones with no percentage', () => {
    const rows = compareGroups(
      [group('a', 300), group('b', 500), group('new', 100)],
      [group('a', 200), group('b', 500), group('gone', 50)]
    )
    expect(rows.map((r) => r.key)).toEqual(['b', 'a', 'new', 'gone'])
    expect(rows.find((r) => r.key === 'a')).toMatchObject({
      previous: 200,
      delta: 100,
      deltaPct: 0.5,
    })
    expect(rows.find((r) => r.key === 'new')).toMatchObject({
      previous: 0,
      delta: 100,
      deltaPct: null,
    })
    expect(rows.find((r) => r.key === 'gone')).toMatchObject({
      current: 0,
      previous: 50,
      delta: -50,
    })
  })

  test('without a previous period nothing is compared', () => {
    const [row] = compareGroups([group('a', 300)], null)
    expect(row).toMatchObject({ previous: null, delta: null, deltaPct: null, previousCount: null })
  })
})
