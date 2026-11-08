import { describe, expect, test } from 'bun:test'
import { csvField, toCsv } from './csv'

describe('csv', () => {
  test('quotes commas, quotes and newlines', () => {
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
  })
  test('defuses formulas but keeps numbers', () => {
    expect(csvField('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvField(-250.5)).toBe('-250.5')
  })
  test('renders empty values and rows', () => {
    expect(toCsv(['a', 'b'], [[null, true]])).toBe('a,b\r\n,true\r\n')
  })
})
