import { describe, expect, test } from 'bun:test'
import {
  approxTokens,
  formatPercent,
  scoreArm,
  seededSample,
  splitDate,
} from './categorization-eval'

describe('splitDate', () => {
  test('returns the date at the quantile', () => {
    const dates = Array.from({ length: 10 }, (_, i) => `2025-01-${String(i + 1).padStart(2, '0')}`)
    expect(splitDate(dates, 0.8)).toBe('2025-01-09')
  })

  test('sorts unsorted input and handles empty input', () => {
    expect(splitDate(['2025-03-01', '2025-01-01'], 0)).toBe('2025-01-01')
    expect(splitDate([])).toBeNull()
  })
})

describe('seededSample', () => {
  const items = Array.from({ length: 50 }, (_, i) => i)

  test('is repeatable for the same seed and differs for another', () => {
    expect(seededSample(items, 10, 7)).toEqual(seededSample(items, 10, 7))
    expect(seededSample(items, 10, 7)).not.toEqual(seededSample(items, 10, 8))
  })

  test('respects the limit, keeps items unique and leaves the input alone', () => {
    const sample = seededSample(items, 10, 1)
    expect(sample).toHaveLength(10)
    expect(new Set(sample).size).toBe(10)
    expect(items[0]).toBe(0)
    expect(seededSample(items, 500, 1)).toHaveLength(50)
  })
})

describe('scoreArm', () => {
  const truths = [
    { category: 'food', name: 'Swiggy' },
    { category: 'rent', name: 'Landlord' },
    { category: 'fuel', name: null },
    { category: 'food', name: 'Zomato' },
  ]

  test('scores accuracy over answered rows and coverage over all rows', () => {
    const score = scoreArm(
      [
        { category: 'food', name: 'swiggy' },
        { category: 'other', name: 'Landlord' },
        { category: null, name: null },
        { category: null, name: null },
      ],
      truths
    )
    expect(score.rows).toBe(4)
    expect(score.answered).toBe(2)
    expect(score.coverage).toBe(0.5)
    expect(score.categoryAccuracy).toBe(0.5)
    expect(score.nameMatchRate).toBe(1)
  })

  test('reports null rates when nothing was answered', () => {
    const score = scoreArm([], truths)
    expect(score.coverage).toBe(0)
    expect(score.categoryAccuracy).toBeNull()
    expect(score.nameMatchRate).toBeNull()
  })

  test('a missing truth name never matches', () => {
    const score = scoreArm(
      [{ category: 'fuel', name: 'Shell' }],
      [{ category: 'fuel', name: null }]
    )
    expect(score.categoryAccuracy).toBe(1)
    expect(score.nameMatchRate).toBe(0)
  })
})

describe('formatting', () => {
  test('tokens and percent', () => {
    expect(approxTokens(401)).toBe(101)
    expect(formatPercent(0.1234)).toBe('12.3%')
    expect(formatPercent(null)).toBe('-')
  })
})
