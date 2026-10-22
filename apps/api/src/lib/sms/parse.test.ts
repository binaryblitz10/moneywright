import { describe, expect, test } from 'bun:test'
import { looksLikeTransaction, parseSms, toCompleteSms } from './parse'

describe('parseSms', () => {
  test('HDFC style debit', () => {
    const text =
      'Rs.1,250.50 spent on HDFC Bank Card x1234 at SWIGGY on 12-10-25 via UPI. Avl Limit: Rs.80,000.00'
    expect(parseSms(text)).toMatchObject({
      amount: 1250.5,
      currency: 'INR',
      type: 'debit',
      last4: '1234',
      merchant: 'SWIGGY',
    })
  })

  test('ICICI style with INR prefix and masked card', () => {
    const text =
      'INR 899.00 spent using ICICI Bank Card XX4321 on 12-Oct-25 at AMAZON PAY. Avl Limit: INR 1,20,000.00'
    const parsed = parseSms(text)
    expect(parsed.amount).toBe(899)
    expect(parsed.currency).toBe('INR')
    expect(parsed.last4).toBe('4321')
    expect(parsed.merchant).toBe('AMAZON PAY')
  })

  test('Amex style with dollars and "ending"', () => {
    const text = 'Amex Alert: You used your card ending 5678 for $45.20 at STARBUCKS.'
    expect(parseSms(text)).toMatchObject({
      amount: 45.2,
      currency: 'USD',
      type: 'debit',
      last4: '5678',
      merchant: 'STARBUCKS',
    })
  })

  test('currency code after the amount', () => {
    const parsed = parseSms('You have spent 120.00 AED on card **9012 at CARREFOUR.')
    expect(parsed.amount).toBe(120)
    expect(parsed.currency).toBe('AED')
    expect(parsed.last4).toBe('9012')
    expect(parsed.merchant).toBe('CARREFOUR')
  })

  test('refund is a credit', () => {
    const parsed = parseSms('Refund of Rs.500.00 credited to your card ending 1234 at MYNTRA.')
    expect(parsed.type).toBe('credit')
    expect(parsed.amount).toBe(500)
  })

  test('available limit is not the amount', () => {
    const parsed = parseSms('Avl limit Rs.50,000 . Rs.300 spent on card x1111 at UBER')
    expect(parsed.amount).toBe(300)
  })

  test('missing merchant stays null so the message is reviewed', () => {
    const parsed = parseSms('Rs.300 spent on card x1111')
    expect(parsed.merchant).toBeNull()
    expect(toCompleteSms(parsed)).toBeNull()
  })
})

describe('looksLikeTransaction', () => {
  test('rejects OTPs', () => {
    expect(looksLikeTransaction('123456 is your OTP for Rs.500 payment at AMAZON')).toBe(false)
  })

  test('rejects chat without an amount or money verb', () => {
    expect(looksLikeTransaction('See you at 5, I paid already')).toBe(false)
  })

  test('rejects bill reminders', () => {
    expect(looksLikeTransaction('Your card statement of Rs.5,000 is due on 15-Oct')).toBe(false)
  })

  test('accepts a card alert', () => {
    expect(looksLikeTransaction('Rs.300 spent on card x1111 at UBER')).toBe(true)
  })
})

describe('toCompleteSms', () => {
  test('returns a record when every field is present', () => {
    const parsed = parseSms('Rs.300 spent on card x1111 at UBER')
    expect(toCompleteSms(parsed)).toMatchObject({
      amount: 300,
      currency: 'INR',
      type: 'debit',
      last4: '1111',
      merchant: 'UBER',
    })
  })
})
