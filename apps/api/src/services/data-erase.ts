import { eq } from 'drizzle-orm'
import { db, tables } from '../db'
import { logger } from '../lib/logger'

/**
 * Erase everything the user has entered or imported: profiles (which take their accounts,
 * statements, transactions, investments, insurance, loans and budgets with them), rules,
 * preferences, bank messages, chats and learned categorizations.
 *
 * Keeps the user itself, the PIN and the AI provider settings, so the app opens as a
 * fresh install at the onboarding step instead of locking the user out.
 */
export async function eraseAllUserData(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(tables.chatConversations).where(eq(tables.chatConversations.userId, userId))
    await tx.delete(tables.chatQueryCache)
    await tx
      .delete(tables.categorizationEvents)
      .where(eq(tables.categorizationEvents.userId, userId))
    await tx.delete(tables.autoFixBatches).where(eq(tables.autoFixBatches.userId, userId))
    await tx.delete(tables.smsMessages).where(eq(tables.smsMessages.userId, userId))
    await tx.delete(tables.transactionRules).where(eq(tables.transactionRules.userId, userId))
    await tx
      .delete(tables.subscriptionOverrides)
      .where(eq(tables.subscriptionOverrides.userId, userId))
    await tx.delete(tables.userPreferences).where(eq(tables.userPreferences.userId, userId))
    await tx.delete(tables.profiles).where(eq(tables.profiles.userId, userId))
    await tx.update(tables.users).set({ country: null }).where(eq(tables.users.id, userId))
  })
  logger.info('[Data] Erased all user data')
}
