import { describe, expect, test } from 'bun:test'
import {
  cardSuggestions,
  debitsToAttach,
  idsToClear,
  inferCard,
  looksLikePayment,
  matchPayments,
  mentionsWord,
  pickBest,
  pointedAtDebits,
  rankPairs,
  type CardInfo,
  type DebitInfo,
  type PaymentTxn,
} from './card-payment-matching'

function debit(id: string, date: string, amount: number, over: Partial<PaymentTxn> = {}) {
  return {
    id,
    accountId: 'bank',
    date,
    type: 'debit',
    amount,
    category: 'credit_card_payment',
    description: 'CC PAYMENT',
    isHidden: false,
    linkedEntityId: null,
    linkedEntityType: null,
    ...over,
  } satisfies PaymentTxn
}

function credit(id: string, date: string, amount: number, over: Partial<PaymentTxn> = {}) {
  return {
    id,
    accountId: 'card',
    date,
    type: 'credit',
    amount,
    category: 'credit_card_payment',
    description: 'PAYMENT RECEIVED',
    isHidden: false,
    linkedEntityId: null,
    linkedEntityType: null,
    ...over,
  } satisfies PaymentTxn
}

describe('looksLikePayment', () => {
  test('payment category always counts', () => {
    expect(looksLikePayment({ category: 'credit_card_payment', description: 'whatever' })).toBe(
      true
    )
  })

  test('transfer and other need payment words', () => {
    expect(looksLikePayment({ category: 'transfer', description: 'UPI payment thank you' })).toBe(
      true
    )
    expect(looksLikePayment({ category: 'other', description: 'BBPS Payment' })).toBe(true)
    expect(looksLikePayment({ category: 'other', description: 'Amazon reversal' })).toBe(false)
  })

  test('refunds, cashback and purchases never count, even with payment words', () => {
    for (const category of ['refund', 'cashback', 'shopping']) {
      expect(looksLikePayment({ category, description: 'payment received thank you' })).toBe(false)
    }
  })
})

describe('rankPairs / matchPayments', () => {
  const none = new Set<string>()

  test('an exact amount beats a closer date', () => {
    const d = debit('d', '2026-10-10', 12000)
    const near = credit('near', '2026-10-10', 11950)
    const exact = credit('exact', '2026-10-14', 12000)
    expect(rankPairs([d], [near, exact], none).map((p) => p.creditId)).toEqual(['exact', 'near'])
  })

  test('among inexact amounts the closest amount wins, then the closest date', () => {
    const d = debit('d', '2026-10-10', 12000)
    const a = credit('a', '2026-10-10', 11900)
    const b = credit('b', '2026-10-12', 11990)
    const c = credit('c', '2026-10-11', 11990)
    expect(rankPairs([d], [a, b, c], none).map((p) => p.creditId)).toEqual(['c', 'b', 'a'])
  })

  test('allows up to 5 days apart in either direction, not 6', () => {
    const d = debit('d', '2026-10-10', 5000)
    expect(rankPairs([d], [credit('before', '2026-10-05', 5000)], none)).toHaveLength(1)
    expect(rankPairs([d], [credit('after', '2026-10-15', 5000)], none)).toHaveLength(1)
    expect(rankPairs([d], [credit('late', '2026-10-16', 5000)], none)).toHaveLength(0)
  })

  test('amounts outside the tolerance do not pair', () => {
    const d = debit('d', '2026-10-10', 100000)
    expect(rankPairs([d], [credit('c', '2026-10-10', 90000)], none)).toHaveLength(0)
  })

  test('refunds and cashback are never paired', () => {
    const d = debit('d', '2026-10-10', 1200)
    const refund = credit('r', '2026-10-10', 1200, { category: 'refund' })
    const cashback = credit('cb', '2026-10-10', 1200, { category: 'cashback' })
    expect(rankPairs([d], [refund, cashback], none)).toHaveLength(0)
  })

  test('a debit a credit already points at is excluded', () => {
    const d = debit('d', '2026-10-10', 5000)
    const taken = credit('taken', '2026-10-10', 5000, {
      linkedEntityId: 'd',
      linkedEntityType: 'transaction',
    })
    const pointed = pointedAtDebits([taken])
    expect(rankPairs([d], [credit('c', '2026-10-10', 5000)], pointed)).toHaveLength(0)
  })

  test('a debit already linked to the same card can still pair, another card cannot', () => {
    const toCard = debit('d', '2026-10-10', 5000, {
      linkedEntityId: 'card',
      linkedEntityType: 'credit_card',
    })
    const toOther = debit('e', '2026-10-10', 5000, {
      linkedEntityId: 'other-card',
      linkedEntityType: 'credit_card',
    })
    const c = credit('c', '2026-10-10', 5000)
    expect(rankPairs([toCard], [c], new Set())).toHaveLength(1)
    expect(rankPairs([toOther], [c], new Set())).toHaveLength(0)
  })

  test('an already linked credit or a hidden row is skipped', () => {
    const d = debit('d', '2026-10-10', 5000)
    const linked = credit('c1', '2026-10-10', 5000, {
      linkedEntityId: 'x',
      linkedEntityType: 'transaction',
    })
    const hidden = credit('c2', '2026-10-10', 5000, { isHidden: true })
    expect(rankPairs([d], [linked, hidden], new Set())).toHaveLength(0)
    expect(
      rankPairs(
        [debit('h', '2026-10-10', 5000, { isHidden: true })],
        [credit('c', '2026-10-10', 5000)],
        new Set()
      )
    ).toHaveLength(0)
  })

  test('transactions excluded (unlinked by hand) are never paired', () => {
    const d = debit('d', '2026-10-10', 5000)
    const c = credit('c', '2026-10-10', 5000)
    expect(matchPayments([d], [c], none, new Set(['d']))).toHaveLength(0)
    expect(matchPayments([d], [c], none, new Set(['c']))).toHaveLength(0)
    expect(matchPayments([d], [c], none, new Set(['other']))).toHaveLength(1)
  })

  test('matchPayments gives each debit and credit one partner, best pairs first', () => {
    const d1 = debit('d1', '2026-10-10', 5000)
    const d2 = debit('d2', '2026-10-11', 5000)
    const c1 = credit('c1', '2026-10-11', 5000)
    const matched = matchPayments([d1, d2], [c1], new Set())
    expect(matched).toHaveLength(1)
    expect(matched[0]).toMatchObject({ debitId: 'd2', creditId: 'c1' })
  })
})

describe('pickBest', () => {
  const cand = (amountDiff: number, dayDiff: number) => ({ amountDiff, dayDiff })

  test('a single candidate is the best', () => {
    expect(pickBest([cand(40, 4)])).toEqual(cand(40, 4))
  })

  test('one exact amount within 2 days is the best of several', () => {
    const ranked = [cand(0, 2), cand(10, 0), cand(20, 1)]
    expect(pickBest(ranked)).toBe(ranked[0]!)
  })

  test('two strong candidates, or none, leave the choice to the user', () => {
    expect(pickBest([cand(0, 1), cand(0, 2)])).toBeNull()
    expect(pickBest([cand(0, 3), cand(5, 0)])).toBeNull()
    expect(pickBest([])).toBeNull()
  })
})

describe('mentionsWord', () => {
  test('matches whole words, case-insensitively', () => {
    expect(mentionsWord('PAYMENT TO HDFC BANK CARD', 'hdfc')).toBe(true)
    expect(mentionsWord('PAYMENT TO HDFC BANK CARD', 'HDFC Bank')).toBe(true)
    expect(mentionsWord('XHDFCX', 'hdfc')).toBe(false)
    expect(mentionsWord('anything', ' ')).toBe(false)
  })
})

describe('inferCard', () => {
  const card = (id: string, over: Partial<CardInfo> = {}): CardInfo => ({
    id,
    name: id,
    last4: null,
    institutionTerms: [],
    latestBalance: null,
    ...over,
  })
  const info = (description: string, amount = 1000, own: string[] = []): DebitInfo => ({
    description,
    amount,
    ownInstitutionTerms: own,
  })

  test('last 4 digits in the description', () => {
    const cards = [card('a', { last4: '4468' }), card('b', { last4: '9999' })]
    expect(inferCard(info('CC PAYMENT 4468'), cards)).toMatchObject({
      accountId: 'a',
      reason: 'Card ending 4468 is in the description',
    })
  })

  test('last 4 must stand alone, not sit inside a longer number', () => {
    const cards = [card('a', { last4: '4468' }), card('b', { last4: '9999' })]
    expect(inferCard(info('REF 1234468 PAYMENT'), cards)).toBeNull()
  })

  test('institution named in the description, as a whole word', () => {
    const cards = [
      card('a', { institutionTerms: ['hdfc', 'HDFC Bank'] }),
      card('b', { institutionTerms: ['icici', 'ICICI Bank'] }),
    ]
    expect(inferCard(info('Bill pay to ICICI Bank card'), cards)?.accountId).toBe('b')
    expect(inferCard(info('Bill pay to ICICIX card'), cards)).toBeNull()
  })

  test("the paying bank's own name does not identify the card", () => {
    const cards = [
      card('a', { institutionTerms: ['hdfc'] }),
      card('b', { institutionTerms: ['icici'] }),
    ]
    expect(inferCard(info('HDFC BANK NETBANKING CC PAYMENT', 1000, ['hdfc']), cards)).toBeNull()
  })

  test('amount equal to the latest statement balance', () => {
    const cards = [card('a', { latestBalance: 12000.5 }), card('b', { latestBalance: 800 })]
    expect(inferCard(info('CC PAYMENT', 12000), cards)).toMatchObject({
      accountId: 'a',
      reason: 'Same amount as the latest card statement',
    })
    expect(inferCard(info('CC PAYMENT', 12002), cards)).toBeNull()
  })

  test('a user with one card', () => {
    expect(inferCard(info('CC PAYMENT'), [card('a')])).toMatchObject({
      accountId: 'a',
      reason: 'Only card you have',
    })
  })

  test('ambiguous or unknown cases return null', () => {
    expect(inferCard(info('CC PAYMENT'), [card('a'), card('b')])).toBeNull()
    expect(inferCard(info('CC PAYMENT'), [])).toBeNull()
    const sameLast4 = [card('a', { last4: '4468' }), card('b', { last4: '4468' })]
    expect(inferCard(info('CC 4468'), sameLast4)).toBeNull()
    const sameBalance = [card('a', { latestBalance: 1000 }), card('b', { latestBalance: 1000 })]
    expect(inferCard(info('CC PAYMENT', 1000), sameBalance)).toBeNull()
  })

  test('a rule that fits several cards narrows the choice for the next rule', () => {
    const cards = [
      card('a', { institutionTerms: ['hdfc'], latestBalance: 500 }),
      card('b', { institutionTerms: ['hdfc'], latestBalance: 1000 }),
      card('c', { institutionTerms: ['icici'], latestBalance: 1000 }),
    ]
    expect(inferCard(info('HDFC CARD PAYMENT', 1000), cards)?.accountId).toBe('b')
  })

  test('cardSuggestions lists every card with a reason, best reason first', () => {
    const cards = [
      card('a', { latestBalance: 1000 }),
      card('b', { last4: '4468' }),
      card('c', { latestBalance: 5 }),
    ]
    const result = cardSuggestions(info('CC 4468', 1000), cards)
    expect(result.map((r) => r.accountId)).toEqual(['b', 'a'])
    expect(cardSuggestions(info('CC'), [card('a')]).map((r) => r.reason)).toEqual([
      'Only card you have',
    ])
  })
})

describe('idsToClear', () => {
  const ref = (id: string, type: string | null = null, target: string | null = null) => ({
    id,
    linkedEntityId: target,
    linkedEntityType: type,
  })

  test('a card credit takes the bank debit it points at', () => {
    expect(idsToClear([ref('credit', 'transaction', 'debit')], []).sort()).toEqual([
      'credit',
      'debit',
    ])
  })

  test('a bank debit takes the credits pointing at it, but not the card it is linked to', () => {
    expect(idsToClear([ref('debit', 'credit_card', 'card-account')], ['credit']).sort()).toEqual([
      'credit',
      'debit',
    ])
  })

  test('does not repeat ids', () => {
    expect(
      idsToClear([ref('a', 'transaction', 'b'), ref('b', 'transaction', 'a')], ['a', 'b']).sort()
    ).toEqual(['a', 'b'])
  })
})

describe('debitsToAttach', () => {
  test('skips paired, linked and manually unlinked debits', () => {
    const open = debit('a', '2026-10-10', 100)
    const linked = debit('b', '2026-10-10', 100, {
      linkedEntityId: 'card',
      linkedEntityType: 'credit_card',
    })
    const result = debitsToAttach(
      [
        open,
        linked,
        debit('c', '2026-10-10', 100),
        debit('d', '2026-10-10', 100),
        debit('e', '2026-10-10', 100),
      ],
      new Set(['c']),
      new Set(['d'])
    )
    expect(result.map((t) => t.id)).toEqual(['a', 'e'])
  })
})
