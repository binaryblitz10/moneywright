import { describe, expect, test } from 'bun:test'
import { overlapScore } from './match'
import { parseMessageDate } from './parse'
import { pickTransactionDate } from './date'

describe('overlapScore', () => {
  test('a shortened alert name matches the full statement text', () => {
    expect(overlapScore('RAZORPAY SWI', 'RAZORPAY*Swiggy Bangalore')).toBeGreaterThan(0)
    expect(overlapScore('RAZ*The Mes', 'Razorpay*The Messy Cafe Mumbai')).toBeGreaterThan(0)
    expect(overlapScore('HOUZILLA INT', 'HOUZILLA INTERNET PVT LTD Bengaluru')).toBeGreaterThan(0)
  })

  test('the UPI reference number identifies the payment', () => {
    expect(overlapScore('UPI/P2A/665930217593/YASH SINGH', 'UPI-665930217593-Y S')).toBeGreaterThan(
      0
    )
  })

  test('unrelated merchants do not match', () => {
    expect(overlapScore('ICICI BANK L', 'EMPORIO SALON EMPORIO S SOUTH DELHI')).toBe(0)
  })

  test('filler words alone are not a match', () => {
    expect(overlapScore('RAZORPAY SWI', 'Razorpay*Airbnb Bengaluru')).toBe(0)
  })

  test('card bill payment text matches', () => {
    expect(overlapScore('CRD-PMNT-411146****2783', 'CRD-PMNT-411146****2783')).toBeGreaterThan(0)
  })
})

describe('parseMessageDate', () => {
  test('reads the date formats banks use', () => {
    expect(
      parseMessageDate('INR 1299.00 debited A/c no. XX1312 20-10-26, 21:27:25 UPI/P2A/1/X')
    ).toBe('2026-10-20')
    expect(
      parseMessageDate(
        'Spent INR 362 using Axis Bank Credit Card no. XX2783 on 21-10-26 14:59:19 IST'
      )
    ).toBe('2026-10-21')
    expect(
      parseMessageDate(
        "You've spent INR 989.00 on your AMEX card ** 41005 at X on 19 October 2026 at 07:27 PM"
      )
    ).toBe('2026-10-19')
    expect(parseMessageDate('charged to your Amex Card ending 1005 on 08/10/2026 via SI Hub')).toBe(
      '2026-10-08'
    )
  })

  test('an amount is not a date and an impossible date is ignored', () => {
    expect(parseMessageDate('Spent INR 1,23.45 at SHOP')).toBeNull()
    expect(parseMessageDate('on 31-02-26')).toBeNull()
  })
})

describe('pickTransactionDate', () => {
  const arrival = new Date(2026, 9, 21, 15, 0).toISOString()

  test('uses the stated date when it is plausible', () => {
    expect(pickTransactionDate('2026-10-20', arrival)).toBe('2026-10-20')
    expect(pickTransactionDate('2026-10-21', arrival)).toBe('2026-10-21')
  })

  test('falls back to the arrival day', () => {
    expect(pickTransactionDate(null, arrival)).toBe('2026-10-21')
    expect(pickTransactionDate('2026-10-25', arrival)).toBe('2026-10-21') // after arrival
    expect(pickTransactionDate('2026-09-01', arrival)).toBe('2026-10-21') // too old
  })
})
