import { eq, and, isNull } from 'drizzle-orm'
import { db, tables, dbType } from '../db'

/**
 * Preference keys used in the app
 */
export const PREFERENCE_KEYS = {
  DASHBOARD_CHART_TIMEFRAME: 'dashboard.chart_timeframe',
  DASHBOARD_HIDDEN_WIDGETS: 'dashboard.hidden_widgets',
  DATA_HEALTH_IGNORED_CHECKS: 'data_health.ignored_checks',
  DISMISSED_DUPLICATES: 'review.dismissed_duplicates',
  DISMISSED_SMS_MATCHES: 'review.dismissed_sms_matches',
  DISMISSED_CARD_PAYMENTS: 'data_health.dismissed_card_payments',
  MANUALLY_UNLINKED: 'card_payments.manually_unlinked',
  OLLAMA_CUSTOM_MODELS: 'llm.ollama_custom_models',
  STATEMENT_CATEGORISATION_PROVIDER: 'statement.categorisation.provider',
  STATEMENT_CATEGORISATION_MODEL: 'statement.categorisation.model',
  DEFAULT_CATEGORIZATION_HINTS: 'statement.default_categorization_hints',
  SMS_IMPORT_ENABLED: 'sms_import.enabled',
  SMS_IMPORT_AI_PARSING: 'sms_import.ai_parsing',
  SMS_IMPORT_IGNORE_UNKNOWN: 'sms_import.ignore_unknown_accounts',
  SMS_IMPORT_CURSOR: 'sms_import.cursor',
} as const

/**
 * Ollama custom model definition
 */
export interface OllamaCustomModel {
  id: string
  name: string
  supportsThinking?: boolean
}

export type PreferenceKey = (typeof PREFERENCE_KEYS)[keyof typeof PREFERENCE_KEYS]

/**
 * Get a preference value
 * If profileId is provided, looks for profile-specific preference first, then falls back to user-level
 */
export async function getPreference(
  userId: string,
  key: PreferenceKey,
  profileId?: string | null
): Promise<string | null> {
  // If profileId provided, try profile-specific first
  if (profileId) {
    const [profilePref] = await db
      .select()
      .from(tables.userPreferences)
      .where(
        and(
          eq(tables.userPreferences.userId, userId),
          eq(tables.userPreferences.profileId, profileId),
          eq(tables.userPreferences.key, key)
        )
      )
      .limit(1)

    if (profilePref) {
      return profilePref.value
    }
  }

  // Fall back to user-level preference (profileId is null)
  const [userPref] = await db
    .select()
    .from(tables.userPreferences)
    .where(
      and(
        eq(tables.userPreferences.userId, userId),
        isNull(tables.userPreferences.profileId),
        eq(tables.userPreferences.key, key)
      )
    )
    .limit(1)

  return userPref?.value || null
}

/**
 * Set a preference value
 * profileId can be null for user-level preferences
 */
export async function setPreference(
  userId: string,
  key: PreferenceKey,
  value: string,
  profileId?: string | null
): Promise<void> {
  const now = dbType === 'postgres' ? new Date() : new Date().toISOString()

  // Check if preference exists
  const existingConditions = [
    eq(tables.userPreferences.userId, userId),
    eq(tables.userPreferences.key, key),
  ]

  if (profileId) {
    existingConditions.push(eq(tables.userPreferences.profileId, profileId))
  } else {
    existingConditions.push(isNull(tables.userPreferences.profileId))
  }

  const [existing] = await db
    .select()
    .from(tables.userPreferences)
    .where(and(...existingConditions))
    .limit(1)

  if (existing) {
    // Update existing
    await db
      .update(tables.userPreferences)
      .set({
        value,
        updatedAt: now as Date,
      })
      .where(eq(tables.userPreferences.id, existing.id))
  } else {
    // Insert new
    await db.insert(tables.userPreferences).values({
      userId,
      profileId: profileId || null,
      key,
      value,
      createdAt: now as Date,
      updatedAt: now as Date,
    })
  }
}

/**
 * Delete a preference
 */
export async function deletePreference(
  userId: string,
  key: PreferenceKey,
  profileId?: string | null
): Promise<void> {
  const conditions = [
    eq(tables.userPreferences.userId, userId),
    eq(tables.userPreferences.key, key),
  ]

  if (profileId) {
    conditions.push(eq(tables.userPreferences.profileId, profileId))
  } else {
    conditions.push(isNull(tables.userPreferences.profileId))
  }

  await db.delete(tables.userPreferences).where(and(...conditions))
}

/**
 * Get all preferences for a user (optionally filtered by profile)
 */
export async function getAllPreferences(
  userId: string,
  profileId?: string | null
): Promise<Record<string, string>> {
  // Get user-level preferences (profileId is null)
  const userPrefs = await db
    .select()
    .from(tables.userPreferences)
    .where(and(eq(tables.userPreferences.userId, userId), isNull(tables.userPreferences.profileId)))

  const result: Record<string, string> = {}

  // Add user-level preferences
  for (const pref of userPrefs) {
    result[pref.key] = pref.value
  }

  // If profileId provided, override with profile-specific preferences
  if (profileId) {
    const profilePrefs = await db
      .select()
      .from(tables.userPreferences)
      .where(
        and(
          eq(tables.userPreferences.userId, userId),
          eq(tables.userPreferences.profileId, profileId)
        )
      )

    for (const pref of profilePrefs) {
      result[pref.key] = pref.value
    }
  }

  return result
}

/**
 * Parse a stored JSON value into a string array, returning [] if it is not an array of strings
 */
function parseCategoryList(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) return []
    return parsed
  } catch {
    return []
  }
}

/**
 * Helper: Get the duplicate groups the user marked as not duplicates (user-wide)
 */
export async function getDismissedDuplicates(userId: string): Promise<string[]> {
  const value = await getPreference(userId, PREFERENCE_KEYS.DISMISSED_DUPLICATES, null)
  return value ? parseCategoryList(value) : []
}

/**
 * Helper: Mark duplicate groups as not duplicates, or bring them back
 */
export async function setDuplicatesDismissed(
  userId: string,
  signatures: string[],
  dismissed: boolean
): Promise<void> {
  const current = new Set(await getDismissedDuplicates(userId))
  for (const signature of signatures) {
    if (dismissed) current.add(signature)
    else current.delete(signature)
  }
  await setPreference(userId, PREFERENCE_KEYS.DISMISSED_DUPLICATES, JSON.stringify([...current]))
}

/**
 * Helper: Get the "SMS transaction|statement transaction" pairs the user said are different purchases
 */
export async function getDismissedSmsMatches(userId: string): Promise<string[]> {
  const value = await getPreference(userId, PREFERENCE_KEYS.DISMISSED_SMS_MATCHES, null)
  return value ? parseCategoryList(value) : []
}

/**
 * Helper: Remember that an SMS transaction and a statement transaction are different purchases
 */
export async function dismissSmsMatch(
  userId: string,
  smsTransactionId: string,
  transactionId: string
): Promise<void> {
  const current = new Set(await getDismissedSmsMatches(userId))
  current.add(`${smsTransactionId}|${transactionId}`)
  await setPreference(userId, PREFERENCE_KEYS.DISMISSED_SMS_MATCHES, JSON.stringify([...current]))
}

/**
 * Helper: Get the transaction ids of card payment checks the user marked as correct (user-wide)
 */
export async function getDismissedCardPayments(userId: string): Promise<string[]> {
  const value = await getPreference(userId, PREFERENCE_KEYS.DISMISSED_CARD_PAYMENTS, null)
  return value ? parseCategoryList(value) : []
}

/**
 * Helper: Mark card payment checks as correct (hidden from Data Health), or bring them back
 */
export async function setCardPaymentsDismissed(
  userId: string,
  transactionIds: string[],
  dismissed: boolean
): Promise<void> {
  const current = new Set(await getDismissedCardPayments(userId))
  for (const id of transactionIds) {
    if (dismissed) current.add(id)
    else current.delete(id)
  }
  await setPreference(userId, PREFERENCE_KEYS.DISMISSED_CARD_PAYMENTS, JSON.stringify([...current]))
}

/**
 * Helper: Get the transactions the user unlinked by hand; the auto-linker leaves them alone
 */
export async function getManuallyUnlinked(userId: string): Promise<string[]> {
  const value = await getPreference(userId, PREFERENCE_KEYS.MANUALLY_UNLINKED, null)
  return value ? parseCategoryList(value) : []
}

/**
 * Helper: Remember transactions unlinked by hand, or forget them after an explicit link
 */
export async function setManuallyUnlinked(
  userId: string,
  transactionIds: string[],
  unlinked: boolean
): Promise<void> {
  if (transactionIds.length === 0) return
  const current = new Set(await getManuallyUnlinked(userId))
  const before = current.size
  for (const id of transactionIds) {
    if (unlinked) current.add(id)
    else current.delete(id)
  }
  if (current.size === before && !unlinked) return
  await setPreference(userId, PREFERENCE_KEYS.MANUALLY_UNLINKED, JSON.stringify([...current]))
}

/**
 * Helper: Get custom Ollama models for user
 */
export async function getOllamaCustomModels(userId: string): Promise<OllamaCustomModel[]> {
  const value = await getPreference(userId, PREFERENCE_KEYS.OLLAMA_CUSTOM_MODELS, null)
  if (!value) return []

  try {
    return JSON.parse(value)
  } catch {
    return []
  }
}

/**
 * Helper: Set custom Ollama models for user
 */
export async function setOllamaCustomModels(
  userId: string,
  models: OllamaCustomModel[]
): Promise<void> {
  await setPreference(userId, PREFERENCE_KEYS.OLLAMA_CUSTOM_MODELS, JSON.stringify(models), null)
}

/**
 * Helper: Add a custom Ollama model
 */
export async function addOllamaCustomModel(
  userId: string,
  model: OllamaCustomModel
): Promise<OllamaCustomModel[]> {
  const models = await getOllamaCustomModels(userId)

  // Check if model with same ID already exists
  const existingIndex = models.findIndex((m) => m.id === model.id)
  if (existingIndex >= 0) {
    // Update existing
    models[existingIndex] = model
  } else {
    // Add new
    models.push(model)
  }

  await setOllamaCustomModels(userId, models)
  return models
}

/**
 * Helper: Remove a custom Ollama model
 */
export async function removeOllamaCustomModel(
  userId: string,
  modelId: string
): Promise<OllamaCustomModel[]> {
  const models = await getOllamaCustomModels(userId)
  const filtered = models.filter((m) => m.id !== modelId)
  await setOllamaCustomModels(userId, filtered)
  return filtered
}
