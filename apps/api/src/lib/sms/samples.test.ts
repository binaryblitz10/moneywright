import { describe, expect, test } from 'bun:test'
import { looksLikeTransaction, parseSms } from './parse'

const UPI_DEBIT = `INR 1299.00 debited
A/c no. XX1312
20-10-26, 21:27:25
UPI/P2A/665930217593/YASH SINGH
Not you? SMS BLOCKUPI Cust ID to 919951860002
Axis Bank`

const AXIS_CARD = `Spent INR 362 
using Axis Bank Credit Card no. XX2783 on 21-10-26 14:59:19 IST at 
BLINKIT. 
Avl limit: INR 854664.29. Not you? SMS BLOCK 2783 to +919951860002`

const AXIS_CARD_TWO_WORDS = `Spent INR 1230 
using Axis Bank Credit Card no. XX2783 on 20-10-26 15:54:44 IST at 
FLYING SPAR. 
Avl limit: INR 855026.29. Not you? SMS BLOCK 2783 to +919951860002`

const IMPS_DEBIT = `Debit INR 52393.27
Axis Bank A/c XX1312
19-10-26 16:12:02
IMPS/P2A/629216814995/Amer
WhatsApp BAL to 917036165000
Not You? SMS BLOCKALL CustID to 919951860002`

const AMEX = (amount: string, merchant: string, date: string) =>
  `Alert: You've spent INR ${amount} on your AMEX card ** 41005 at ${merchant} on ${date} at 07:27 PM IST. Call 18004190691 if this was not made by you.`

const AMEX_SI =
  'INR 139.00 for Spotiify India Pvt Ltd has been charged to your Amex Card ending 1005 on 08/10/2026 via SI Hub. You can manage your Standing Instructions with SI Hub ID Yaq8AHx6g8 at www.americanexpress.com/in/sihub. T&Cs apply.'

const OTP =
  '470960 is SECRET OTP for txn of INR 885.00 on Axis Bank card XX9280 at Swiggy on 17-10-26 20:58:18. OTP valid for 5 mins. Please do not share this OTP.'

describe('real alert samples', () => {
  test('Axis UPI debit', () => {
    expect(parseSms(UPI_DEBIT).date).toBe('2026-10-20')
    expect(parseSms(UPI_DEBIT)).toMatchObject({
      amount: 1299,
      currency: 'INR',
      type: 'debit',
      last4: '1312',
      merchant: 'UPI/P2A/665930217593/YASH SINGH',
    })
  })

  test('Axis credit card', () => {
    expect(parseSms(AXIS_CARD)).toMatchObject({
      amount: 362,
      currency: 'INR',
      type: 'debit',
      last4: '2783',
      merchant: 'BLINKIT',
    })
    expect(parseSms(AXIS_CARD_TWO_WORDS).merchant).toBe('FLYING SPAR')
  })

  test('Axis IMPS debit', () => {
    expect(parseSms(IMPS_DEBIT)).toMatchObject({
      amount: 52393.27,
      currency: 'INR',
      type: 'debit',
      last4: '1312',
      merchant: 'IMPS/P2A/629216814995/Amer',
    })
  })

  test('Amex alert with a five digit card suffix', () => {
    expect(parseSms(AMEX('4,459.00', 'PERCH WINE A', '18 October 2026'))).toMatchObject({
      amount: 4459,
      currency: 'INR',
      type: 'debit',
      last4: '1005',
      merchant: 'PERCH WINE A',
    })
    expect(parseSms(AMEX('989.00', 'RAZORPAY SWI', '19 October 2026')).merchant).toBe(
      'RAZORPAY SWI'
    )
    expect(parseSms(AMEX('683.00', 'HOUZILLA INT', '22 October 2026')).amount).toBe(683)
  })

  test('Amex standing instruction charge', () => {
    expect(parseSms(AMEX_SI)).toMatchObject({
      amount: 139,
      currency: 'INR',
      type: 'debit',
      last4: '1005',
      merchant: 'Spotiify India Pvt Ltd',
    })
  })

  test('all transaction alerts are candidates and the OTP is not', () => {
    for (const text of [
      UPI_DEBIT,
      AXIS_CARD,
      IMPS_DEBIT,
      AMEX_SI,
      AMEX('1.00', 'X Y', '1 May 2026'),
    ]) {
      expect(looksLikeTransaction(text)).toBe(true)
    }
    expect(looksLikeTransaction(OTP)).toBe(false)
  })
})

describe('payments and notices', () => {
  const PAYMENT =
    'Dear Customer, a payment of INR 52,393.27 was received on your Amex Card ***41005 19/10/2026. It may take 24-48 hours for your payment to be credited. Thank you.'
  const STATEMENT =
    'Dear Customer, your statement for AMEX Card **********41005 has been generated. Total payment of Rs.52393.27 is due by 05/11/26. Please ignore if already paid.'
  const CARD_BILL_DEBIT =
    'Debit INR 33247.90 Axis Bank A/c XX1312 15-10-26 07:10:44 CRD-PMNT-411146****2783 WhatsApp BAL to 917036165000 Not You? SMS BLOCKALL CustID to 919951860002'

  test('card bill payment received is a credit', () => {
    expect(looksLikeTransaction(PAYMENT)).toBe(true)
    expect(parseSms(PAYMENT)).toMatchObject({
      amount: 52393.27,
      currency: 'INR',
      type: 'credit',
      last4: '1005',
      merchant: 'Payment received',
    })
  })

  test('a biller receipt without a card or account is ignored', () => {
    const JIO =
      'Payment of Rs. 765.82 has been received on 26-Sep-26\nJio Number : 9810979180\nPayment Mode : Credit Card\nTransaction ID : HD016268BAMAAAEM2WPI'
    expect(looksLikeTransaction(JIO)).toBe(false)
  })

  test('statement notices are ignored', () => {
    expect(looksLikeTransaction(STATEMENT)).toBe(false)
  })

  test('bank narration is the merchant', () => {
    expect(parseSms(CARD_BILL_DEBIT)).toMatchObject({
      amount: 33247.9,
      currency: 'INR',
      type: 'debit',
      last4: '1312',
      merchant: 'CRD-PMNT-411146****2783',
    })
  })
})
