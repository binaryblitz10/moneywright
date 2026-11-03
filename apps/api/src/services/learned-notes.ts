/**
 * "Notes about you": a few durable facts about the user (salary source, usual merchants, people
 * they paid) distilled from their data and corrections. The notes are added to the
 * categorization prompt, and the user can edit them.
 */

import { generateText } from 'ai'
import { and, desc, eq } from 'drizzle-orm'
import { db, tables, dbType } from '../db'
import { createLLMClientFromSettings, LLM_TIMEOUT_MS } from '../llm'
import { logger } from '../lib/logger'
import { findRecurringCredits, timestampMs } from '../lib/learned-notes'

const MAX_NOTES_LENGTH = 2000
const TOP_MERCHANTS = 15
const RECENT_CORRECTIONS = 50
const MAX_NAMED_PEOPLE = 20
/** A refresh needs this many new transactions or this many new corrections */
const MIN_NEW_TRANSACTIONS = 20
const MIN_NEW_EVENTS = 5
/** Notes are first written once the profile has this many categorized transactions */
const MIN_FIRST_TRANSACTIONS = 20

const SYSTEM_PROMPT =
  'You maintain short notes about a person, used to help categorize their bank transactions. Output only the bullet points, one per line, each starting with "- ". No heading, no commentary.'

function now(): Date | string {
  return dbType === 'postgres' ? new Date() : new Date().toISOString()
}

interface NotesState {
  notes: string | null
  updatedAt: number | null
  editedAt: number | null
}

async function loadState(userId: string, profileId: string): Promise<NotesState | null> {
  const [profile] = await db
    .select({
      notes: tables.profiles.learnedNotes,
      updatedAt: tables.profiles.learnedNotesUpdatedAt,
      editedAt: tables.profiles.learnedNotesEditedAt,
    })
    .from(tables.profiles)
    .where(and(eq(tables.profiles.id, profileId), eq(tables.profiles.userId, userId)))
    .limit(1)
  if (!profile) return null
  return {
    notes: profile.notes,
    updatedAt: timestampMs(profile.updatedAt),
    editedAt: timestampMs(profile.editedAt),
  }
}

export async function getLearnedNotes(userId: string, profileId: string): Promise<string | null> {
  return (await loadState(userId, profileId))?.notes ?? null
}

/** Save the user's own edit; empty text clears the notes */
export async function saveLearnedNotes(
  userId: string,
  profileId: string,
  text: string
): Promise<string | null> {
  const notes = text.trim().slice(0, MAX_NOTES_LENGTH) || null
  await db
    .update(tables.profiles)
    .set({ learnedNotes: notes, learnedNotesEditedAt: notes ? (now() as Date) : null })
    .where(and(eq(tables.profiles.id, profileId), eq(tables.profiles.userId, userId)))
  return notes
}

/** Clear the notes and when they were written or edited, so the next refresh starts fresh */
export async function resetLearnedNotes(userId: string, profileId: string): Promise<void> {
  await db
    .update(tables.profiles)
    .set({ learnedNotes: null, learnedNotesUpdatedAt: null, learnedNotesEditedAt: null })
    .where(and(eq(tables.profiles.id, profileId), eq(tables.profiles.userId, userId)))
}

/** The facts the AI is asked to turn into notes, as prompt text */
async function collectFacts(userId: string, profileId: string): Promise<string> {
  const rows = await db
    .select({
      fingerprint: tables.transactions.merchantFingerprint,
      type: tables.transactions.type,
      date: tables.transactions.date,
      amount: tables.transactions.amount,
      category: tables.transactions.category,
      name: tables.transactions.summary,
      description: tables.transactions.originalDescription,
      categorySource: tables.transactions.categorySource,
      nameSource: tables.transactions.nameSource,
    })
    .from(tables.transactions)
    .where(
      and(
        eq(tables.transactions.userId, userId),
        eq(tables.transactions.profileId, profileId),
        eq(tables.transactions.isHidden, false)
      )
    )

  const credits = findRecurringCredits(
    rows
      .filter((r) => r.type === 'credit' && r.fingerprint)
      .map((r) => ({
        fingerprint: r.fingerprint ?? '',
        date: r.date,
        amount: Number(r.amount),
        description: r.name ?? r.description ?? r.fingerprint ?? '',
      }))
  )

  const merchants = new Map<
    string,
    { count: number; name: string | null; categories: Map<string, number> }
  >()
  for (const r of rows) {
    if (!r.fingerprint) continue
    const merchant = merchants.get(r.fingerprint) ?? {
      count: 0,
      name: r.name,
      categories: new Map<string, number>(),
    }
    merchant.count += 1
    merchant.name ??= r.name
    const category = r.category ?? 'other'
    merchant.categories.set(category, (merchant.categories.get(category) ?? 0) + 1)
    merchants.set(r.fingerprint, merchant)
  }
  const topMerchants = [...merchants.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, TOP_MERCHANTS)
    .map(([fingerprint, m]) => {
      const category = [...m.categories.entries()].sort((a, b) => b[1] - a[1])[0]![0]
      return `${m.name ?? fingerprint} (${m.count}x, ${category})`
    })

  const named = new Map<string, string>()
  for (const r of rows) {
    if (!r.fingerprint?.startsWith('upi:')) continue
    if (r.categorySource !== 'user' && r.nameSource !== 'user') continue
    named.set(r.fingerprint, `${r.name ?? r.fingerprint} -> ${r.category ?? 'other'}`)
  }

  const events = await db
    .select({
      field: tables.categorizationEvents.field,
      description: tables.categorizationEvents.description,
      fromValue: tables.categorizationEvents.fromValue,
      toValue: tables.categorizationEvents.toValue,
    })
    .from(tables.categorizationEvents)
    .where(
      and(
        eq(tables.categorizationEvents.userId, userId),
        eq(tables.categorizationEvents.profileId, profileId),
        eq(tables.categorizationEvents.action, 'correct')
      )
    )
    .orderBy(desc(tables.categorizationEvents.createdAt))
    .limit(RECENT_CORRECTIONS)

  const section = (title: string, lines: string[]): string =>
    lines.length > 0 ? `${title}:\n${lines.map((l) => `- ${l}`).join('\n')}` : ''

  return [
    section(
      'Recurring credits (3+ months)',
      credits.map((c) => `${c.description}: ${c.months} months, about ${c.averageAmount} each`)
    ),
    section('Most frequent merchants', topMerchants),
    section(
      'People the user named or categorized (UPI)',
      [...named.values()].slice(0, MAX_NAMED_PEOPLE)
    ),
    section(
      'Recent corrections by the user',
      events.map(
        (e) =>
          `${e.field}: "${e.description.slice(0, 60)}" ${e.fromValue ?? '?'} -> ${e.toValue ?? '?'}`
      )
    ),
  ]
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Rewrite the notes from the profile's data, merged with the current notes. Returns the notes
 * (the current ones when nothing could be refreshed, e.g. no AI is configured).
 */
export async function refreshLearnedNotes(
  userId: string,
  profileId: string,
  model?: string
): Promise<string | null> {
  const state = await loadState(userId, profileId)
  if (!state) return null

  const facts = await collectFacts(userId, profileId)
  if (!facts) return state.notes

  let llm
  try {
    llm = await createLLMClientFromSettings(model, 'categorization')
  } catch {
    return state.notes
  }

  const userEdited =
    state.editedAt !== null && (state.updatedAt === null || state.editedAt > state.updatedAt)
  const editRule = userEdited
    ? 'The user edited these notes by hand: keep every existing line exactly as it is and only add new lines.\n\n'
    : ''

  const { text } = await generateText({
    model: llm.model,
    providerOptions: llm.providerOptions,
    system: SYSTEM_PROMPT,
    prompt: `${editRule}CURRENT NOTES:\n${state.notes?.trim() || '(none yet)'}\n\nFACTS FROM THEIR DATA:\n${facts}\n\nWrite the updated notes: at most 12 bullet points, about 800 characters in total. Keep only durable facts that help categorize transactions (income sources, recurring payees, who specific UPI ids are, category habits). Merge with the current notes and drop duplicates. Do not invent anything the facts do not support.`,
    abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS.short),
  })

  const notes = text.trim().slice(0, MAX_NOTES_LENGTH)
  if (!notes) return state.notes

  await db
    .update(tables.profiles)
    .set({ learnedNotes: notes, learnedNotesUpdatedAt: now() as Date })
    .where(and(eq(tables.profiles.id, profileId), eq(tables.profiles.userId, userId)))
  return notes
}

/** Refresh the notes when enough has changed since they were written. Never throws. */
export async function maybeRefreshLearnedNotes(
  userId: string,
  profileId: string,
  model?: string
): Promise<void> {
  try {
    const state = await loadState(userId, profileId)
    if (!state) return

    const [transactions, events] = await Promise.all([
      db
        .select({
          createdAt: tables.transactions.createdAt,
          category: tables.transactions.category,
        })
        .from(tables.transactions)
        .where(
          and(
            eq(tables.transactions.userId, userId),
            eq(tables.transactions.profileId, profileId),
            eq(tables.transactions.isHidden, false)
          )
        ),
      db
        .select({ createdAt: tables.categorizationEvents.createdAt })
        .from(tables.categorizationEvents)
        .where(
          and(
            eq(tables.categorizationEvents.userId, userId),
            eq(tables.categorizationEvents.profileId, profileId)
          )
        ),
    ])

    const since = state.updatedAt
    const isNew = (createdAt: string | Date): boolean =>
      since === null || (timestampMs(createdAt) ?? 0) > since
    const newTransactions = transactions.filter((t) => isNew(t.createdAt)).length
    const newEvents = events.filter((e) => isNew(e.createdAt)).length

    const due =
      since === null
        ? transactions.filter((t) => t.category).length >= MIN_FIRST_TRANSACTIONS
        : newTransactions >= MIN_NEW_TRANSACTIONS || newEvents >= MIN_NEW_EVENTS
    if (!due) return

    await refreshLearnedNotes(userId, profileId, model)
  } catch (error) {
    logger.error('[LearnedNotes] Refresh failed:', error)
  }
}
