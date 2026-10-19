import { describe, test, expect } from 'bun:test'
import { runParserLocal } from './execute-parser'

const VALID_PARSER = `
  return text.split('\\n').map((line) => {
    const [date, description, amount] = line.split(',')
    return { date, description, amount: Number(amount), type: 'debit', balance: null }
  })
`

describe('runParserLocal', () => {
  test('returns transactions from valid parser code', async () => {
    const result = await runParserLocal(VALID_PARSER, '2024-01-05,Coffee,4.5\n2024-01-06,Lunch,12')
    expect(result.success).toBe(true)
    expect(result.transactions).toHaveLength(2)
    expect(result.transactions?.[0]).toMatchObject({ date: '2024-01-05', amount: 4.5 })
  })

  test('returns an error when the code throws', async () => {
    const result = await runParserLocal('throw new Error("boom")', 'x')
    expect(result.success).toBe(false)
    expect(result.error).toContain('boom')
  })

  test('returns an error for non-serializable results', async () => {
    const result = await runParserLocal('return [() => 1]', 'x')
    expect(result.success).toBe(false)
  })

  test('times out on an infinite loop and keeps the main thread responsive', async () => {
    let ticks = 0
    const interval = setInterval(() => ticks++, 100)
    const started = Date.now()
    const result = await runParserLocal('while (true) {}', 'x', 'transaction', 1000)
    clearInterval(interval)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Execution timeout')
    expect(Date.now() - started).toBeLessThan(2500)
    expect(ticks).toBeGreaterThan(5)
  })

  test('times out on a catastrophic backtracking regex', async () => {
    // JavaScriptCore caps regex backtracking (~1.6s for this pattern), so use a short timeout
    // that the pattern reliably exceeds
    const code = `return /^(a|a?)+$/.test(text) ? [] : []`
    const started = Date.now()
    const result = await runParserLocal(code, 'a'.repeat(60) + '!', 'transaction', 300)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Execution timeout')
    expect(Date.now() - started).toBeLessThan(3000)
  })

  test('supports holdings mode', async () => {
    const code = `return [{ investment_type: 'Stock', name: 'ACME', units: 10, current_value: 1000, currency: 'usd' }]`
    const result = await runParserLocal(code, 'x', 'holding')
    expect(result.success).toBe(true)
    expect(result.holdings?.[0]).toMatchObject({
      investment_type: 'stock',
      name: 'ACME',
      currency: 'USD',
    })
  })

  test('does not expose process (directly or via the Function constructor)', async () => {
    const code = `
      const viaConstructor = [].map.constructor('return typeof process + typeof fetch')()
      return [{
        date: '2024-01-01',
        amount: 1,
        type: 'debit',
        description: typeof process + ',' + typeof fetch + ',' + viaConstructor,
      }]
    `
    const result = await runParserLocal(code, 'x')
    expect(result.success).toBe(true)
    expect(result.transactions?.[0]?.description).toBe('undefined,undefined,undefinedundefined')
  })
})
