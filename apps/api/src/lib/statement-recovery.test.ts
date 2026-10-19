import { describe, expect, test } from 'bun:test'
import {
  findOrphanPlaceholderAccountIds,
  groupByAccount,
  isCategorizableDocumentType,
  isInterruptedStatus,
} from './statement-recovery'

describe('isInterruptedStatus', () => {
  test('only pending and parsing are interrupted', () => {
    expect(isInterruptedStatus('pending')).toBe(true)
    expect(isInterruptedStatus('parsing')).toBe(true)
    expect(isInterruptedStatus('completed')).toBe(false)
    expect(isInterruptedStatus('failed')).toBe(false)
  })
})

describe('isCategorizableDocumentType', () => {
  test('excludes investment statements', () => {
    expect(isCategorizableDocumentType('bank_statement')).toBe(true)
    expect(isCategorizableDocumentType('credit_card_statement')).toBe(true)
    expect(isCategorizableDocumentType('investment_statement')).toBe(false)
  })
})

describe('findOrphanPlaceholderAccountIds', () => {
  const accounts = [
    { id: 'a1', name: 'Pending - a.pdf' },
    { id: 'a2', name: 'Pending - b.pdf' },
    { id: 'a3', name: 'Pending - c.pdf' },
    { id: 'a4', name: 'HDFC Savings' },
    { id: 'a5', name: null },
  ]

  test('keeps placeholders referenced by statements or transactions, and real accounts', () => {
    const orphans = findOrphanPlaceholderAccountIds(accounts, new Set(['a2']), new Set(['a3']))
    expect(orphans).toEqual(['a1'])
  })

  test('returns nothing when there is nothing to clean up', () => {
    expect(findOrphanPlaceholderAccountIds([], new Set(), new Set())).toEqual([])
  })
})

describe('groupByAccount', () => {
  test('groups statements per account without duplicates', () => {
    const base = { userId: 'u', profileId: 'p' }
    const groups = groupByAccount([
      { ...base, accountId: 'a1', statementId: 's1' },
      { ...base, accountId: 'a2', statementId: 's2' },
      { ...base, accountId: 'a1', statementId: 's3' },
      { ...base, accountId: 'a1', statementId: 's1' },
    ])
    expect(groups).toEqual([
      { ...base, accountId: 'a1', statementIds: ['s1', 's3'] },
      { ...base, accountId: 'a2', statementIds: ['s2'] },
    ])
  })
})
