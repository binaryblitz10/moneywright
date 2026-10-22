/**
 * Parsing of bank alert messages using an LLM.
 * Only used when the user turned on AI parsing and the rule-based parser could not read a message.
 */

import { generateObject } from 'ai'
import { createLLMClientFromSettings } from './index'
import { smsTransactionSchema } from './schemas'
import type { ParsedSms } from '../lib/sms/parse'
import { logger } from '../lib/logger'

/**
 * Read the transaction details from a message. Returns null when the model says the message is
 * not a transaction. Fields the model could not find are null.
 */
export async function parseSmsWithLLM(body: string): Promise<ParsedSms | null> {
  const { model, providerOptions } = await createLLMClientFromSettings()

  const prompt = `Extract the transaction from this bank or credit card alert message.
Return is_transaction=false for OTPs, promotions, balance or due-date reminders and anything else
that is not a completed transaction. Do not guess: use null for any field the message does not state.

MESSAGE:
${body}`

  const { object } = await generateObject({
    model,
    schema: smsTransactionSchema,
    prompt,
    providerOptions,
  })
  logger.debug(`[SmsParser] AI parsed message, is_transaction=${object.is_transaction}`)

  if (!object.is_transaction) return null

  const amount = object.amount !== null ? Math.round(object.amount * 100) / 100 : null
  const last4 = object.last4?.replace(/\D/g, '').slice(-4) ?? null
  return {
    date: null,
    amount: amount !== null && amount > 0 ? amount : null,
    currency:
      object.currency && /^[A-Za-z]{3}$/.test(object.currency)
        ? object.currency.toUpperCase()
        : null,
    type: object.type,
    last4: last4 && last4.length === 4 ? last4 : null,
    merchant: object.merchant?.trim() || null,
  }
}
