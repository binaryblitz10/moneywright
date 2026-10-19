import { z } from 'zod/v4'
import { isKnownCategory } from './constants'

/**
 * Field schemas shared by the transaction create and update requests
 */

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6
}

export const transactionDateSchema = z
  .string()
  .refine(isValidIsoDate, { message: 'Date must be a valid YYYY-MM-DD date' })

export const transactionAmountSchema = z
  .number()
  .positive('Amount must be greater than zero')
  .refine(Number.isFinite, { message: 'Amount must be a finite number' })
  .refine(hasAtMostTwoDecimals, { message: 'Amount can have at most 2 decimal places' })

export const transactionTypeSchema = z.enum(['credit', 'debit'])

export const transactionCategorySchema = z
  .string()
  .min(1)
  .refine((c) => isKnownCategory(c), { message: 'Unknown category' })
