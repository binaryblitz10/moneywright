import { describe, expect, test } from 'bun:test'
import { senderSimilarity, senderTrust, type SenderCounts } from './sender'

const counts = (entries: Record<string, number>): SenderCounts => new Map(Object.entries(entries))

describe('senderSimilarity', () => {
  test('alike bank addresses score high', () => {
    expect(senderSimilarity('AMEXIN-S', 'AMEXIN-T')).toBeGreaterThanOrEqual(0.7)
    expect(senderSimilarity('AX-AXISBK-S', 'VM-AXISBK-P')).toBe(1)
  })

  test('different senders score low', () => {
    expect(senderSimilarity('JIO', 'AMEXIN-S')).toBeLessThan(0.5)
    expect(senderSimilarity('HDFCBK', 'AXISBK')).toBeLessThan(0.7)
  })

  test('phone numbers only match exactly', () => {
    expect(senderSimilarity('+919810979180', '+919810979181')).toBe(0)
    expect(senderSimilarity('+91 98109 79180', '+919810979180')).toBe(1)
  })
})

describe('senderTrust', () => {
  const verified = counts({ 'AMEXIN-S': 3, 'AX-AXISBK-S': 2 })

  test('has no opinion before anything is verified', () => {
    expect(senderTrust('JIO', counts({}), counts({}))).toBe('unknown')
  })

  test('a sender like a verified one is a bank', () => {
    expect(senderTrust('AMEXIN-T', verified, counts({}))).toBe('bank')
    expect(senderTrust('VM-AXISBK-P', verified, counts({}))).toBe('bank')
  })

  test('a sender unlike every verified one is a vendor', () => {
    expect(senderTrust('JIO', verified, counts({}))).toBe('vendor')
  })

  test('dismissed messages weigh against a sender', () => {
    expect(senderTrust('AMEXIN-S', verified, counts({ 'AMEXIN-S': 3 }))).toBe('vendor')
    expect(senderTrust('AMEXIN-S', verified, counts({ 'AMEXIN-S': 1 }))).toBe('bank')
  })
})
