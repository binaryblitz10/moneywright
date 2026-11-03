import { describe, expect, test } from 'bun:test'
import { merchantFingerprint, FINGERPRINT_VERSION } from './merchant-fingerprint'

describe('merchantFingerprint', () => {
  test('exposes a version', () => {
    expect(FINGERPRINT_VERSION).toBe(3)
  })

  test('uses the UPI id for people and named merchants', () => {
    expect(merchantFingerprint('UPI/412345678901/DR/ramesh.kumar@oksbi/HDFC')).toBe(
      'upi:ramesh.kumar@oksbi'
    )
    expect(merchantFingerprint('UPI-SWIGGY-swiggy@icici-412345678901-Order')).toBe(
      'upi:swiggy@icici'
    )
  })

  test('falls back to words for QR-style numeric UPI ids', () => {
    const fp = merchantFingerprint(
      'UPI/DR/412345678901/paytmqr2810050501011abcd@paytm/Sharma Store'
    )
    expect(fp.startsWith('upi:')).toBe(false)
    expect(fp).toContain('sharma')
  })

  test('is stable across references and dates for the same UPI merchant', () => {
    expect(merchantFingerprint('UPI/412345678901/DR/zomato@hdfcbank/Food')).toBe(
      merchantFingerprint('UPI/998877665544/DR/zomato@hdfcbank/Food')
    )
  })

  test('drops channel words and references from NEFT, IMPS and POS lines', () => {
    expect(merchantFingerprint('NEFT-HDFCN52026110212345-ACME SERVICES PVT LTD-SALARY')).toBe(
      'acme services salary'
    )
    expect(merchantFingerprint('IMPS/P2A/412345678901/RAHUL SHARMA/HDFC')).toBe('rahul sharma hdfc')
    expect(merchantFingerprint('POS 4567XXXXXX1234 BIG BAZAAR MUMBAI')).toBe('big bazaar')
  })

  test('handles US style lines', () => {
    expect(merchantFingerprint('ACH DEBIT NETFLIX.COM 12/03')).toBe('netflix')
    expect(merchantFingerprint('SQ *BLUE BOTTLE COFFEE 0412')).toBe('sq blue bottle')
    expect(merchantFingerprint('AMZN Mktp US*2K4AB1')).toBe('amzn mktp')
  })

  test('is stable for the same merchant with different refs and dates', () => {
    expect(merchantFingerprint('POS 4567XXXXXX1234 BIG BAZAAR MUMBAI 01/02')).toBe(
      merchantFingerprint('POS 4567XXXXXX9999 BIG BAZAAR MUMBAI 15/03')
    )
    expect(merchantFingerprint('AMZN Mktp US*2K4AB1')).toBe(
      merchantFingerprint('AMZN Mktp US*9Z8XY7')
    )
  })

  test('keeps non-Latin letters', () => {
    expect(merchantFingerprint('खरीद स्विगी 123456')).toBe('खरीद स्विगी')
  })

  test('returns an empty string when nothing identifies the merchant', () => {
    expect(merchantFingerprint('NEFT 123456789012')).toBe('')
    expect(merchantFingerprint('')).toBe('')
  })

  test('ignores the city and the payment gateway', () => {
    expect(merchantFingerprint('AMAZON Mumbai')).toBe(merchantFingerprint('AMAZON Bangalore'))
    expect(merchantFingerprint('MARKS & SPENCERS NEW DELHI')).toBe('marks spencers')
    expect(merchantFingerprint('Paytm*UBERINDIASYSTEMSP Noida')).toBe('uberindiasystemsp')
    expect(merchantFingerprint('NEW BALANCE STORE')).toBe('new balance store')
  })
})
