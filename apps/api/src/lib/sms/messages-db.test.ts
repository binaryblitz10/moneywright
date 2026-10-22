import { describe, expect, test } from 'bun:test'
import { appleDateToIso, decodeAttributedBody } from './messages-db'

describe('decodeAttributedBody', () => {
  test('reads a short string after the NSString marker', () => {
    const text = 'Rs.300 spent on card x1111 at UBER'
    const blob = Buffer.concat([
      Buffer.from(
        'streamtyped\u0081è\u0003\u0084\u0001@\u0084\u0084\u0084\u0012NSAttributedString'
      ),
      Buffer.from(
        '\u0000\u0084\u0084\u0008NSObject\u0000\u0085\u0092\u0084\u0084\u0084\u0008NSString\u0001\u0094\u0084\u0001'
      ),
      Buffer.from([0x2b, text.length]),
      Buffer.from(text),
    ])
    expect(decodeAttributedBody(blob)).toBe(text)
  })

  test('reads a two byte length for long strings', () => {
    const text = 'x'.repeat(300)
    const length = Buffer.alloc(2)
    length.writeUInt16LE(text.length)
    const blob = Buffer.concat([
      Buffer.from('NSString'),
      Buffer.from([0x01, 0x2b, 0x81]),
      length,
      Buffer.from(text),
    ])
    expect(decodeAttributedBody(blob)).toBe(text)
  })

  test('returns null without the marker', () => {
    expect(decodeAttributedBody(Buffer.from('nothing here'))).toBeNull()
    expect(decodeAttributedBody(null)).toBeNull()
  })
})

describe('appleDateToIso', () => {
  test('handles nanosecond and second timestamps', () => {
    expect(appleDateToIso(0)).toBe('2001-01-01T00:00:00.000Z')
    expect(appleDateToIso(86_400 * 1e9)).toBe('2001-01-02T00:00:00.000Z')
    expect(appleDateToIso(86_400)).toBe('2001-01-02T00:00:00.000Z')
  })
})
