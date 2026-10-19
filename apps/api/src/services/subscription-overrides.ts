import { and, eq, inArray } from 'drizzle-orm'
import { db, tables, dbType } from '../db'
import { merchantKey } from './spending-changes'

/**
 * Subscription overrides service
 * Lets the user change what was detected: set the billing frequency, remove a subscription,
 * or add a recurring payment that was not detected. Overrides are keyed by merchant key.
 */

export const SUBSCRIPTION_FREQUENCIES = ['monthly', 'quarterly', 'yearly'] as const
export type SubscriptionFrequency = (typeof SUBSCRIPTION_FREQUENCIES)[number]

export interface SubscriptionOverrideState {
  frequency: SubscriptionFrequency | null
  isRemoved: boolean
}

export class SubscriptionNotFoundError extends Error {}

function isFrequency(value: string | null): value is SubscriptionFrequency {
  return SUBSCRIPTION_FREQUENCIES.some((f) => f === value)
}

function nowValue(): Date {
  return (dbType === 'postgres' ? new Date() : new Date().toISOString()) as Date
}

/** All overrides of a user, by merchant key */
export async function getSubscriptionOverrides(
  userId: string
): Promise<Map<string, SubscriptionOverrideState>> {
  const rows = await db
    .select()
    .from(tables.subscriptionOverrides)
    .where(eq(tables.subscriptionOverrides.userId, userId))

  return new Map(
    rows.map((row) => [
      row.merchantKey,
      { frequency: isFrequency(row.frequency) ? row.frequency : null, isRemoved: row.isRemoved },
    ])
  )
}

async function saveOverride(
  userId: string,
  key: string,
  values: { frequency?: SubscriptionFrequency | null; isRemoved: boolean }
): Promise<void> {
  const now = nowValue()
  const { frequency, isRemoved } = values
  await db
    .insert(tables.subscriptionOverrides)
    .values({ userId, merchantKey: key, frequency: frequency ?? null, isRemoved })
    .onConflictDoUpdate({
      target: [tables.subscriptionOverrides.userId, tables.subscriptionOverrides.merchantKey],
      set: {
        // An undefined frequency keeps the saved one
        ...(frequency !== undefined ? { frequency } : {}),
        isRemoved,
        updatedAt: now,
      },
    })
}

/** Ids of the user's debit transactions that belong to a merchant */
async function findMerchantTransactionIds(userId: string, key: string): Promise<string[]> {
  const rows = await db
    .select({
      id: tables.transactions.id,
      summary: tables.transactions.summary,
      originalDescription: tables.transactions.originalDescription,
    })
    .from(tables.transactions)
    .where(
      and(
        eq(tables.transactions.userId, userId),
        eq(tables.transactions.type, 'debit'),
        eq(tables.transactions.isHidden, false)
      )
    )
  return rows.filter((row) => merchantKey(row) === key).map((row) => row.id)
}

async function setSubscriptionFlag(ids: string[], isSubscription: boolean): Promise<void> {
  if (ids.length === 0) return
  await db
    .update(tables.transactions)
    .set({ isSubscription, updatedAt: nowValue() })
    .where(inArray(tables.transactions.id, ids))
}

/** Set how often a subscription is billed, replacing the detected frequency */
export async function setSubscriptionFrequency(
  userId: string,
  key: string,
  frequency: SubscriptionFrequency
): Promise<void> {
  await saveOverride(userId, key, { frequency, isRemoved: false })
}

/**
 * Remove a subscription: its charges stop being flagged and the merchant stays hidden,
 * so later charges are not detected as a subscription again
 */
export async function removeSubscription(userId: string, key: string): Promise<void> {
  await setSubscriptionFlag(await findMerchantTransactionIds(userId, key), false)
  await saveOverride(userId, key, { isRemoved: true })
}

/**
 * Add a recurring payment by picking one of its transactions: every charge from the same
 * merchant is flagged as a subscription, billed at the given frequency
 */
export async function addSubscription(
  userId: string,
  transactionId: string,
  frequency: SubscriptionFrequency
): Promise<string> {
  const [txn] = await db
    .select({
      summary: tables.transactions.summary,
      originalDescription: tables.transactions.originalDescription,
      type: tables.transactions.type,
    })
    .from(tables.transactions)
    .where(and(eq(tables.transactions.id, transactionId), eq(tables.transactions.userId, userId)))
    .limit(1)

  if (!txn || txn.type !== 'debit') {
    throw new SubscriptionNotFoundError('Pick a payment (debit) transaction')
  }

  const key = merchantKey(txn)
  await setSubscriptionFlag(await findMerchantTransactionIds(userId, key), true)
  await saveOverride(userId, key, { frequency, isRemoved: false })
  return key
}
