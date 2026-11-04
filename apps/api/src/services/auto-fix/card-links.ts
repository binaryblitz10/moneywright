/**
 * Fixers for links between transactions: card payments, transfers between own accounts, and
 * links left pointing one way.
 */

import { and, asc, eq, isNull } from 'drizzle-orm'
import { db, dbType, tables } from '../../db'
import type { Transaction } from '../../db'
import { daysApart } from '../../lib/duplicate-references'
import { CARD_PAYMENT_CATEGORY } from '../../lib/card-payment-matching'
import { findLinkCandidates, linkTransactions } from '../transactions'
import { healthFor } from './health'
import { loadTransactions, trackTransactions, transactionLabel } from './rows'
import { makeFixId } from './values'
import type { Fix, Fixer } from './types'

const CREDIT_CARD_TYPE = 'credit_card'
/** Exact-amount suggestions further apart than this are left for the user to look at */
const MAX_PAYMENT_DAYS = 3
/** Transfer-looking rows examined per run, newest first */
const MAX_TRANSFER_ROWS = 500

interface PairData {
  firstId: string
  secondId: string
}

/** Both still exist, are visible and have no link, so linking them replaces nothing */
function stillFree(rows: Array<Transaction | undefined>): boolean {
  return rows.every((row) => row && !row.linkedEntityId && !row.isHidden)
}

async function linkPair(
  userId: string,
  { firstId, secondId }: PairData,
  describe: (row: Transaction) => string
) {
  const rows = await loadTransactions(userId, [firstId, secondId])
  if (!stillFree([rows.get(firstId), rows.get(secondId)])) return []
  return trackTransactions(
    userId,
    [firstId, secondId],
    () => linkTransactions(firstId, secondId, 'payment', userId),
    describe
  )
}

const CARD_PAYMENT_ID = 'card-payment-unique'

export const cardPaymentUnique: Fixer = {
  id: CARD_PAYMENT_ID,
  label: 'Link card bill payments',
  hint: 'A payment from your bank account is linked to the credit card it paid, so it is not counted as spending.',
  safe: true,
  usesAi: false,
  async find(ctx) {
    const health = await healthFor(ctx)
    return health.cardPayments.items.flatMap<Fix>((check) => {
      const suggestion = check.suggestion
      if (
        check.kind !== 'unlinked_debit' ||
        suggestion?.kind !== 'transaction' ||
        Math.abs(suggestion.amount - check.amount) >= 0.005 ||
        daysApart(check.date, suggestion.date) > MAX_PAYMENT_DAYS
      ) {
        return []
      }
      return [
        {
          id: makeFixId(CARD_PAYMENT_ID, [check.id, suggestion.transactionId]),
          fixer: CARD_PAYMENT_ID,
          description: `Link the payment of ${check.amount.toFixed(2)} on ${check.date} from ${check.accountName} to ${suggestion.accountName}`,
          entityIds: [check.id, suggestion.transactionId],
          data: { firstId: check.id, secondId: suggestion.transactionId } satisfies PairData,
        },
      ]
    })
  },
  apply: (ctx, fix) =>
    linkPair(ctx.userId, fix.data as PairData, (row) => `Linked ${transactionLabel(row)}`),
}

const TRANSFER_ID = 'transfer-pairs'

async function loadAccountNames(userId: string): Promise<Map<string, string>> {
  const accounts = await db
    .select({ id: tables.accounts.id, name: tables.accounts.accountName })
    .from(tables.accounts)
    .where(eq(tables.accounts.userId, userId))
  return new Map(accounts.map((account) => [account.id, account.name ?? 'Account']))
}

/** "INR 1,00,000.00 from Axis Bank to ICICI Bank on 20 Apr 2026" */
function describeTransfer(
  row: Transaction,
  partner: { id: string; accountId: string; date: string },
  names: Map<string, string>
): string {
  const [from, to] =
    row.type === 'debit' ? [row.accountId, partner.accountId] : [partner.accountId, row.accountId]
  const amount = Number(row.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })
  const date = new Date(`${row.date}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `${row.currency} ${amount} from ${names.get(from) ?? 'Account'} to ${names.get(to) ?? 'Account'} on ${date}`
}

export const transferPairs: Fixer = {
  id: TRANSFER_ID,
  label: 'Link transfers between your accounts',
  hint: 'Pairs the debit and the credit of the same money moving between two of your own accounts. Your totals do not change, since both sides are already marked as transfers.',
  safe: false,
  usesAi: false,
  async find(ctx) {
    const rows = await db
      .select()
      .from(tables.transactions)
      .where(
        and(
          eq(tables.transactions.userId, ctx.userId),
          ctx.profileId ? eq(tables.transactions.profileId, ctx.profileId) : undefined,
          eq(tables.transactions.category, 'transfer'),
          eq(tables.transactions.isHidden, false),
          isNull(tables.transactions.linkedEntityId)
        )
      )
      .orderBy(asc(tables.transactions.date))
      .limit(MAX_TRANSFER_ROWS)

    const accountNames = await loadAccountNames(ctx.userId)
    const fixes = new Map<string, Fix>()
    for (const row of rows) {
      const candidates = await findLinkCandidates(row.id, ctx.userId)
      const partner = candidates.length === 1 ? candidates[0]! : null
      if (!partner || partner.profileId !== row.profileId) continue
      if (partner.category === CARD_PAYMENT_CATEGORY) continue
      // The partner must have no other candidate either, or the pairing is a guess
      const back = await findLinkCandidates(partner.id, ctx.userId)
      if (back.length !== 1 || back[0]!.id !== row.id) continue

      const ids = [row.id, partner.id].sort()
      const id = makeFixId(TRANSFER_ID, ids)
      if (fixes.has(id)) continue
      fixes.set(id, {
        id,
        fixer: TRANSFER_ID,
        description: describeTransfer(row, partner, accountNames),
        entityIds: ids,
        data: { firstId: ids[0]!, secondId: ids[1]! } satisfies PairData,
      })
    }
    return [...fixes.values()]
  },
  async apply(ctx, fix) {
    const { firstId, secondId } = fix.data as PairData
    const rows = await loadTransactions(ctx.userId, [firstId, secondId])
    if (!stillFree([rows.get(firstId), rows.get(secondId)])) return []
    return trackTransactions(
      ctx.userId,
      [firstId, secondId],
      () => linkTransactions(firstId, secondId, 'transfer', ctx.userId),
      (row) => `Linked transfer ${transactionLabel(row)}`
    )
  },
}

const BROKEN_ID = 'broken-links'

type Repair = 'restore' | 'clear'

/**
 * What to do with a card credit that points at a bank debit: nothing when the debit points back;
 * point the debit at the card when it has no link of its own; else drop the credit's link.
 */
function repairFor(credit: Transaction, target: Transaction | undefined): Repair | null {
  const pointsBack =
    target &&
    ((target.linkedEntityType === CREDIT_CARD_TYPE && target.linkedEntityId === credit.accountId) ||
      (target.linkedEntityType === 'transaction' && target.linkedEntityId === credit.id))
  if (pointsBack) return null
  return target && target.type === 'debit' && !target.linkedEntityId ? 'restore' : 'clear'
}

export const brokenLinks: Fixer = {
  id: BROKEN_ID,
  label: 'Repair one-way card payment links',
  hint: 'A card payment link that only points one way is fixed or removed.',
  safe: true,
  usesAi: false,
  async find(ctx) {
    const credits = await db
      .select({ credit: tables.transactions })
      .from(tables.transactions)
      .innerJoin(tables.accounts, eq(tables.accounts.id, tables.transactions.accountId))
      .where(
        and(
          eq(tables.transactions.userId, ctx.userId),
          ctx.profileId ? eq(tables.transactions.profileId, ctx.profileId) : undefined,
          eq(tables.accounts.type, CREDIT_CARD_TYPE),
          eq(tables.transactions.linkedEntityType, 'transaction')
        )
      )
    const targets = await loadTransactions(
      ctx.userId,
      credits.flatMap(({ credit }) => (credit.linkedEntityId ? [credit.linkedEntityId] : []))
    )

    return credits.flatMap<Fix>(({ credit }) => {
      const target = credit.linkedEntityId ? targets.get(credit.linkedEntityId) : undefined
      const repair = repairFor(credit, target)
      if (!repair) return []
      return [
        {
          id: makeFixId(BROKEN_ID, [credit.id]),
          fixer: BROKEN_ID,
          description:
            repair === 'restore'
              ? `Restore the link of ${transactionLabel(target!)} to the card`
              : `Remove the broken link on ${transactionLabel(credit)}`,
          entityIds: target ? [credit.id, target.id] : [credit.id],
          data: { creditId: credit.id },
        },
      ]
    })
  },
  async apply(ctx, fix) {
    const { creditId } = fix.data as { creditId: string }
    const credit = (await loadTransactions(ctx.userId, [creditId])).get(creditId)
    if (!credit?.linkedEntityId) return []
    const target = (await loadTransactions(ctx.userId, [credit.linkedEntityId])).get(
      credit.linkedEntityId
    )
    const repair = repairFor(credit, target)
    if (!repair) return []

    const now = (dbType === 'postgres' ? new Date() : new Date().toISOString()) as Date
    return trackTransactions(
      ctx.userId,
      fix.entityIds,
      async () => {
        if (repair === 'restore') {
          await db
            .update(tables.transactions)
            .set({
              linkedEntityId: credit.accountId,
              linkedEntityType: CREDIT_CARD_TYPE,
              updatedAt: now,
            })
            .where(eq(tables.transactions.id, target!.id))
        } else {
          await db
            .update(tables.transactions)
            .set({ linkedEntityId: null, linkedEntityType: null, updatedAt: now })
            .where(eq(tables.transactions.id, credit.id))
        }
      },
      (row) =>
        repair === 'restore'
          ? `Restored the card link of ${transactionLabel(row)}`
          : `Removed the broken link on ${transactionLabel(row)}`
    )
  },
}
