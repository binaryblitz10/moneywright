import { z } from 'zod/v4'
import { isKnownCategory } from './constants'
import { isRealDate } from './pdf/validation'

/**
 * Field schemas shared by the transaction create and update requests
 */

function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6
}

export const transactionDateSchema = z
  .string()
  .refine(isRealDate, { message: 'Date must be a valid YYYY-MM-DD date' })

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
