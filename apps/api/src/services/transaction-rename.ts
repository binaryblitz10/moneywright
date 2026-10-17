/**
 * One-time rename of older transactions to the clean name format.
 * Only `summary` and `name_version` are written - categories, confidence and
 * subscription flags are never touched.
 */

import { and, eq, isNull, isNotNull, count } from 'drizzle-orm'
import { nanoid } from '../lib/id'
import { db, tables, dbType } from '../db'
import { createLLMClientFromSettings, type LLMClientResult } from '../llm'
import { logger } from '../lib/logger'
import type { CountryCode } from '../lib/constants'
import { quoteCSVField, streamCsvLines } from '../lib/pdf/csv'
import {
  NAME_FORMAT,
  NAME_VERSION,
  buildNamesInUseSection,
  getNamesInUse,
  parseNameLine,
} from '../lib/pdf/transaction-names'

/** Transactions per LLM request (same as the categorizer) */
const BATCH_SIZE = 250

/** Extra passes for transactions the LLM skipped */
const MAX_RETRIES = 3

export interface RenameJob {
  id: string
  userId: string
  countryCode: CountryCode
  includeEdited: boolean
  /** Model as "provider:model"; the default provider's model when omitted */
  model?: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  /** Transactions that will be renamed */
  totalCount: number
  /** Transactions renamed so far */
  renamedCount: number
  /** Transactions left alone because the user edited them */
  skippedCount: number
  /** Transactions the LLM did not return a name for */
  failedCount: number
  errorMessage?: string
  createdAt: Date
  completedAt?: Date
}

interface RenameCandidate {
  id: string
  date: string
  type: string
  amount: number
  description: string
}

const renameJobs: Map<string, RenameJob> = new Map()
let isRenaming = false

function targetConditions(userId: string, includeEdited: boolean) {
  // Rows with no summary are still waiting for the categorizer, which finds them by the
  // missing summary - naming them here would make it skip them
  const conditions = [
    eq(tables.transactions.userId, userId),
    isNull(tables.transactions.nameVersion),
    isNotNull(tables.transactions.summary),
  ]
  if (!includeEdited) conditions.push(eq(tables.transactions.isManuallyCategorized, false))
  return conditions
}

/** Transactions still on the old summary format that should be renamed */
async function fetchRenameCandidates(
  userId: string,
  includeEdited: boolean
): Promise<RenameCandidate[]> {
  const rows = await db
    .select({
      id: tables.transactions.id,
      date: tables.transactions.date,
      type: tables.transactions.type,
      amount: tables.transactions.amount,
      description: tables.transactions.originalDescription,
    })
    .from(tables.transactions)
    .where(and(...targetConditions(userId, includeEdited)))

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    type: r.type,
    amount: Number(r.amount),
    description: r.description || '',
  }))
}

/** Edited transactions on the old format - skipped unless the user asked for them */
async function countSkipped(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(tables.transactions)
    .where(
      and(
        eq(tables.transactions.userId, userId),
        isNull(tables.transactions.nameVersion),
        isNotNull(tables.transactions.summary),
        eq(tables.transactions.isManuallyCategorized, true)
      )
    )
  return Number(row?.n ?? 0)
}

async function saveName(userId: string, id: string, name: string): Promise<boolean> {
  const now = dbType === 'postgres' ? new Date() : new Date().toISOString()
  const result = await db
    .update(tables.transactions)
    .set({ summary: name, nameVersion: NAME_VERSION, updatedAt: now as Date })
    .where(and(eq(tables.transactions.id, id), eq(tables.transactions.userId, userId)))
    .returning({ id: tables.transactions.id })
  return result.length > 0
}

/** Rename one batch; returns how many names were saved */
async function renameBatch(
  batch: RenameCandidate[],
  userId: string,
  countryCode: CountryCode,
  llmClient: LLMClientResult,
  onRenamed: () => void
): Promise<number> {
  const batchIds = new Set(batch.map((t) => t.id))
  const txnList = batch
    .map((t) => `${t.id},${t.date},${t.type},${t.amount},${quoteCSVField(t.description)}`)
    .join('\n')
  const namesInUse = buildNamesInUseSection(await getNamesInUse(userId))

  const system = `You are a transaction naming engine. You ONLY output CSV data. You NEVER ask questions, provide explanations, or include any text other than CSV lines. Start outputting CSV immediately.`
  const prompt = `Write the name for ALL ${batch.length} transactions below. Output CSV ONLY - no explanations, no questions.

TRANSACTIONS (id,date,type,amount,description):
${txnList}

OUTPUT FORMAT - CSV ONLY, one line per transaction:
id,name

RULES:
- Output EXACTLY ${batch.length} CSV lines, one per transaction
- NO explanations, NO questions, NO commentary - ONLY CSV lines
- id: exact ID from input (copy exactly)
- name: who is on the other side of the transaction, copied from the description.
  Follow NAME FORMAT below exactly. Never invent or guess.

${NAME_FORMAT[countryCode] || NAME_FORMAT.US}

${namesInUse}START OUTPUT NOW:`

  let saved = 0
  try {
    await streamCsvLines(llmClient, system, prompt, async (line) => {
      const parsed = parseNameLine(line)
      if (!parsed || !batchIds.has(parsed.id)) return
      try {
        if (await saveName(userId, parsed.id, parsed.name)) {
          saved++
          onRenamed()
        }
      } catch (err) {
        logger.warn(`[Rename] Failed to save transaction ${parsed.id}:`, err)
      }
    })
  } catch (error) {
    logger.error('[Rename] Streaming error:', error)
  }
  return saved
}

async function runRenameJob(job: RenameJob): Promise<void> {
  const llmClient = await createLLMClientFromSettings(job.model)

  job.skippedCount = job.includeEdited ? 0 : await countSkipped(job.userId)

  let candidates = await fetchRenameCandidates(job.userId, job.includeEdited)
  job.totalCount = candidates.length

  let attempt = 0
  while (candidates.length > 0 && attempt <= MAX_RETRIES) {
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      await renameBatch(
        candidates.slice(i, i + BATCH_SIZE),
        job.userId,
        job.countryCode,
        llmClient,
        () => {
          job.renamedCount++
        }
      )
    }

    // Rows that got a name now have name_version set, so what is left is what the LLM skipped
    candidates = await fetchRenameCandidates(job.userId, job.includeEdited)
    attempt++
  }

  job.failedCount = candidates.length
}

async function processNextRenameJob(): Promise<void> {
  if (isRenaming) return

  const job = Array.from(renameJobs.values()).find((j) => j.status === 'pending')
  if (!job) return

  isRenaming = true
  job.status = 'processing'

  try {
    await runRenameJob(job)
    job.status = 'completed'
    logger.debug(
      `[Rename] Job ${job.id} completed: ${job.renamedCount} renamed, ${job.skippedCount} skipped, ${job.failedCount} failed`
    )
  } catch (error) {
    job.status = 'failed'
    job.errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`[Rename] Job ${job.id} failed:`, job.errorMessage)
  } finally {
    job.completedAt = new Date()
    isRenaming = false
    processNextRenameJob()
  }
}

/**
 * Queue a rename of the user's older transactions. Runs in the background.
 */
export function queueRenameJob(data: {
  userId: string
  countryCode: CountryCode
  includeEdited: boolean
  model?: string
}): string {
  const job: RenameJob = {
    id: nanoid(),
    ...data,
    status: 'pending',
    totalCount: 0,
    renamedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    createdAt: new Date(),
  }

  renameJobs.set(job.id, job)
  logger.debug(`[Rename] Queued job ${job.id}`)
  processNextRenameJob()

  return job.id
}

export function getRenameJobStatus(jobId: string, userId: string): RenameJob | undefined {
  const job = renameJobs.get(jobId)
  return job && job.userId === userId ? job : undefined
}
