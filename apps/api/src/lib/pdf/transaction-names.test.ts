import { describe, expect, test } from 'bun:test'
import {
  MAX_NAMES_IN_USE,
  NAME_FORMAT,
  buildNamesInUseSection,
  parseNameLine,
} from './transaction-names'

describe('buildNamesInUseSection', () => {
  test('is empty when there are no names', () => {
    expect(buildNamesInUseSection([])).toBe('')
    expect(buildNamesInUseSection(['  ', ''])).toBe('')
  })

  test('lists names comma separated', () => {
    const section = buildNamesInUseSection(['Swiggy', 'Rahul Sharma'])
    expect(section).toContain('NAMES ALREADY IN USE')
    expect(section).toContain('Swiggy, Rahul Sharma')
  })

  test('drops names containing commas and caps the list', () => {
    const names = Array.from({ length: MAX_NAMES_IN_USE + 20 }, (_, i) => `Name${i}`)
    const section = buildNamesInUseSection(['Bad, Name', ...names])
    expect(section).not.toContain('Bad, Name')
    expect(section).toContain(`Name${MAX_NAMES_IN_USE - 2}`)
    expect(section).not.toContain(`Name${MAX_NAMES_IN_USE}`)
  })
})

describe('parseNameLine', () => {
  test('parses id and name', () => {
    expect(parseNameLine('abc123,Zerodha Broking')).toEqual({
      id: 'abc123',
      name: 'Zerodha Broking',
    })
  })

  test('handles quoted names and stray commas', () => {
    expect(parseNameLine('abc123,"Acme, Inc"')).toEqual({ id: 'abc123', name: 'Acme, Inc' })
    expect(parseNameLine('abc123,Acme,Inc')).toEqual({ id: 'abc123', name: 'Acme Inc' })
  })

  test('rejects lines without an id or name', () => {
    expect(parseNameLine('abc123')).toBeNull()
    expect(parseNameLine('abc123,')).toBeNull()
    expect(parseNameLine(',Swiggy')).toBeNull()
  })
})

describe('NAME_FORMAT', () => {
  test('uses the country specific tax label', () => {
    expect(NAME_FORMAT.IN).toContain('Tax Deducted')
    expect(NAME_FORMAT.US).toContain('Tax Withheld')
    expect(NAME_FORMAT.US).not.toContain('Tax Deducted')
  })
})
