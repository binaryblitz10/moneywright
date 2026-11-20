import { describe, expect, test } from 'bun:test'
import { feeLinesFor, findSplitMatches, isFeeLine, type SplitRow } from './split-match'

function row(id: string, date: string, amount: number, description: string): SplitRow {
  return { id, accountId: 'card', date, type: 'debit', amount, description }
}

const jd = row('jd', '2026-11-15', 3750.66, 'JD 744 000000744 JACKSONVILLE 39.78')
const markup = row('markup', '2026-11-15', 131.27, 'ISSUER MARKUP ASSESSMENT')
const gst = row('gst', '2026-11-15', 23.63, 'GST/IGST@18%')
const manual = row('manual', '2026-11-14', 3905.56, 'JD Store')

describe('isFeeLine', () => {
  test('recognises issuer fee lines', () => {
    expect(isFeeLine('ISSUER MARKUP ASSESSMENT')).toBe(true)
    expect(isFeeLine('GST/IGST@18%')).toBe(true)
    expect(isFeeLine('JD 744 JACKSONVILLE')).toBe(false)
    expect(isFeeLine('Gstaad Hotel')).toBe(false)
  })
})

describe('findSplitMatches', () => {
  test('matches a purchase plus its fees to the entered amount', () => {
    expect(findSplitMatches([manual], [jd, markup, gst])).toEqual([
      { provisionalId: 'manual', mainId: 'jd', feeIds: ['gst', 'markup'] },
    ])
  })

  test('needs the total to match to the cent', () => {
    const off = { ...manual, amount: 3905.57 }
    expect(findSplitMatches([off], [jd, markup, gst])).toEqual([])
  })

  test('ignores fee lines of another purchase days away', () => {
    const far = [
      jd,
      row('m2', '2026-11-20', 131.27, 'ISSUER MARKUP ASSESSMENT'),
      row('g2', '2026-11-20', 23.63, 'GST/IGST@18%'),
    ]
    expect(findSplitMatches([manual], far)).toEqual([])
  })

  test('leaves an ordinary same-amount match to the normal matching', () => {
    const exact = row('exact', '2026-11-14', 3905.56, 'JD STORE')
    expect(findSplitMatches([manual], [exact, jd, markup, gst])).toEqual([])
  })

  test('skips when two purchase lines could both explain it', () => {
    const twin = row('twin', '2026-11-15', 3750.66, 'JD 744 OTHER BRANCH')
    expect(findSplitMatches([manual], [jd, twin, markup, gst])).toEqual([])
  })

  test('skips when two entries claim the same statement lines', () => {
    const second = row('second', '2026-11-15', 3905.56, 'JD again')
    expect(findSplitMatches([manual, second], [jd, markup, gst])).toEqual([])
  })

  test('skips a pair the user marked as different', () => {
    expect(
      findSplitMatches([manual], [jd, markup, gst], (p, m) => p === 'manual' && m === 'jd')
    ).toEqual([])
  })

  test('does not treat two ordinary purchases as a split', () => {
    const a = row('a', '2026-11-14', 3000, 'SHOP A')
    const b = row('b', '2026-11-14', 905.56, 'SHOP B')
    expect(findSplitMatches([manual], [a, b])).toEqual([])
  })

  test('stays within one account and direction', () => {
    const other = { ...jd, accountId: 'other' }
    expect(findSplitMatches([manual], [other, markup, gst])).toEqual([])
    const credit = { ...jd, type: 'credit' }
    expect(findSplitMatches([manual], [credit, markup, gst])).toEqual([])
  })
})

describe('feeLinesFor', () => {
  test('returns the fee lines that make up the difference', () => {
    const lines = [jd, markup, gst, row('other', '2026-11-15', 500, 'SOMETHING ELSE')]
    expect(
      feeLinesFor(manual, jd, lines)
        ?.map((line) => line.id)
        .sort()
    ).toEqual(['gst', 'markup'])
  })

  test('is null when the fees do not explain the amount', () => {
    expect(feeLinesFor({ ...manual, amount: 3905.57 }, jd, [jd, markup, gst])).toBeNull()
  })
})
