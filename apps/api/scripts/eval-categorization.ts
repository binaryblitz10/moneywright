/**
 * Evaluate categorization learning on your own history.
 *
 *   bun apps/api/scripts/eval-categorization.ts --user <id|email> [--split-date YYYY-MM-DD]
 *     [--limit 300] [--model provider:model] [--no-ai]
 *
 * Ground truth is every transaction whose category was set by the user or a rule. Memory and
 * examples are built only from transactions dated before the split date; the test set is a seeded
 * random sample of ground-truth transactions dated on or after it. Nothing is written to the
 * database. The AI arms call the configured LLM (a few calls of 100 transactions each).
 *
 * Arms: A memory only | B old prompt (no learning) | C new pipeline (memory, then AI with
 * past decisions and corrections). Profile summary, hints and names-in-use are left out of the
 * prompts of B and C alike, so the only difference between them is the learning.
 *
 * The database comes from the environment as in the app (DATA_DIR / DATABASE_URL); run it on a
 * copy of your data with that copy's .env exported (see CLAUDE.md, "Running Dev Against Real Data").
 */

import { and, desc, eq, inArray, isNotNull, ne, or } from 'drizzle-orm'
import { parseArgs } from 'util'
import { db, tables } from '../src/db'
import { createLLMClientFromSettings, LLM_TIMEOUT_MS } from '../src/llm'
import { getCategoriesForCountry, type CountryCode, type LabelSource } from '../src/lib/constants'
import {
  adjustConfidence,
  buildMemory,
  lookupMemory,
  type MemoryEntry,
  type MemoryRow,
} from '../src/lib/categorization-memory'
import { formatCorrections, type CorrectionEvent } from '../src/lib/categorization-examples'
import {
  approxTokens,
  formatPercent,
  scoreArm,
  seededSample,
  splitDate,
  type ArmScore,
  type EvalAnswer,
  type EvalTruth,
} from '../src/lib/categorization-eval'
import { timestampMs } from '../src/lib/learned-notes'
import { merchantFingerprint } from '../src/lib/merchant-fingerprint'
import {
  buildCategorizationPrompt,
  formatCategoryList,
  type LearningContext,
} from '../src/lib/pdf/categorize-transactions'
import { parseCSVLine, streamCsvLines } from '../src/lib/pdf/csv'
import type { TransactionForCategorization } from '../src/lib/pdf/types'

const BATCH_SIZE = 100
const SAMPLE_SEED = 42
const SPLIT_QUANTILE = 0.8
const LOW_CONFIDENCE = 0.6
const CORRECTION_LIMIT = 40

interface TestRow extends TransactionForCategorization {
  fingerprint: string
  truth: EvalTruth
}

interface ArmResult {
  label: string
  score: ArmScore
  /** Share of all rows answered without the AI */
  coverageWithoutAi: number
  aiCalls: number
  promptChars: number
  /** AI answers whose adjusted confidence is below the review threshold */
  lowConfidence: number | null
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

const { values } = parseArgs({
  options: {
    user: { type: 'string' },
    'split-date': { type: 'string' },
    limit: { type: 'string', default: '300' },
    model: { type: 'string' },
    'no-ai': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
})

if (values.help) {
  console.log(
    'Usage: bun apps/api/scripts/eval-categorization.ts --user <id|email> [--split-date YYYY-MM-DD] [--limit 300] [--model provider:model] [--no-ai]'
  )
  process.exit(0)
}
if (!values.user) fail('Missing --user <id|email> (see --help)')
const limit = Number.parseInt(values.limit ?? '300', 10)
if (!Number.isFinite(limit) || limit <= 0) fail('--limit must be a positive number')
if (values['split-date'] && !/^\d{4}-\d{2}-\d{2}$/.test(values['split-date'])) {
  fail('--split-date must look like YYYY-MM-DD')
}

async function findUser(identifier: string): Promise<{ id: string; country: string | null }> {
  const [user] = await db
    .select({ id: tables.users.id, country: tables.users.country })
    .from(tables.users)
    .where(or(eq(tables.users.id, identifier), eq(tables.users.email, identifier)))
    .limit(1)
  if (!user) fail(`No user with id or email "${identifier}"`)
  return user
}

async function loadRows(userId: string): Promise<(MemoryRow & { id: string; amount: number })[]> {
  const rows = await db
    .select({
      id: tables.transactions.id,
      amount: tables.transactions.amount,
      type: tables.transactions.type,
      category: tables.transactions.category,
      name: tables.transactions.summary,
      isSubscription: tables.transactions.isSubscription,
      categorySource: tables.transactions.categorySource,
      nameSource: tables.transactions.nameSource,
      confidence: tables.transactions.categoryConfidence,
      date: tables.transactions.date,
      updatedAt: tables.transactions.updatedAt,
      description: tables.transactions.originalDescription,
      fingerprint: tables.transactions.merchantFingerprint,
    })
    .from(tables.transactions)
    .where(
      and(
        eq(tables.transactions.userId, userId),
        isNotNull(tables.transactions.summary),
        isNotNull(tables.transactions.category),
        eq(tables.transactions.isHidden, false),
        ne(tables.transactions.originalDescription, '')
      )
    )
  return rows.map((r) => ({
    id: r.id,
    amount: Number(r.amount),
    type: r.type,
    category: r.category ?? 'other',
    name: r.name,
    isSubscription: !!r.isSubscription,
    categorySource: r.categorySource as LabelSource | null,
    nameSource: r.nameSource as LabelSource | null,
    confidence: r.confidence === null ? null : Number(r.confidence),
    date: r.date,
    updatedAt: r.updatedAt ?? r.date,
    description: r.description ?? '',
    fingerprint: r.fingerprint || merchantFingerprint(r.description ?? ''),
  }))
}

async function loadCorrectionsBefore(userId: string, splitMs: number): Promise<CorrectionEvent[]> {
  const events = await db
    .select({
      merchantFingerprint: tables.categorizationEvents.merchantFingerprint,
      description: tables.categorizationEvents.description,
      fromValue: tables.categorizationEvents.fromValue,
      toValue: tables.categorizationEvents.toValue,
      createdAt: tables.categorizationEvents.createdAt,
    })
    .from(tables.categorizationEvents)
    .where(
      and(
        eq(tables.categorizationEvents.userId, userId),
        eq(tables.categorizationEvents.action, 'correct'),
        eq(tables.categorizationEvents.field, 'category'),
        inArray(tables.categorizationEvents.fromSource, ['ai', 'memory'])
      )
    )
    .orderBy(desc(tables.categorizationEvents.createdAt))
  return events
    .filter((e) => (timestampMs(e.createdAt as string | Date) ?? Infinity) < splitMs)
    .slice(0, CORRECTION_LIMIT)
}

/** Ask the AI about the test rows in batches; returns the answers by transaction id */
async function runAi(
  rows: TestRow[],
  countryCode: CountryCode,
  validCategories: string[],
  categoryList: string,
  llm: Awaited<ReturnType<typeof createLLMClientFromSettings>>,
  learning: LearningContext | undefined,
  memory: Map<string, MemoryEntry>
): Promise<{
  answers: Map<string, EvalAnswer>
  calls: number
  chars: number
  lowConfidence: number
}> {
  const answers = new Map<string, EvalAnswer>()
  const byId = new Map(rows.map((r) => [r.id, r]))
  let calls = 0
  let chars = 0
  let lowConfidence = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { systemPrompt, prompt } = buildCategorizationPrompt({
      transactions: batch,
      categoryList,
      countryCode,
      learning,
    })
    calls++
    chars += systemPrompt.length + prompt.length
    console.error(
      `  AI batch ${calls}/${Math.ceil(rows.length / BATCH_SIZE)} (${batch.length} rows)`
    )

    try {
      await streamCsvLines(
        llm,
        systemPrompt,
        prompt,
        async (line) => {
          const [id, category, confidenceStr, name] = parseCSVLine(line)
          const row = id ? byId.get(id.trim()) : undefined
          if (!row) return
          const code = category?.toLowerCase().trim() ?? 'other'
          const finalCategory = validCategories.includes(code) ? code : 'other'
          const parsed = Number.parseFloat(confidenceStr ?? '0.8')
          const confidence = Number.isNaN(parsed) ? 0.8 : Math.min(1, Math.max(0, parsed))
          const adjusted = learning
            ? adjustConfidence(
                memory.get(`${row.fingerprint}|${row.type}`) ??
                  lookupMemory(memory, row.fingerprint, row.type)?.entry,
                finalCategory,
                confidence
              )
            : confidence
          if (adjusted < LOW_CONFIDENCE) lowConfidence++
          answers.set(row.id, { category: finalCategory, name: name?.trim() || null })
        },
        LLM_TIMEOUT_MS.categorizeBatch
      )
    } catch (error) {
      console.error(`  batch failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { answers, calls, chars, lowConfidence }
}

function printTable(results: ArmResult[]): void {
  const header = [
    'arm',
    'rows',
    'answered',
    'coverage w/o AI',
    'category acc.',
    'name match',
    'AI calls',
    '~prompt tokens',
    'low-conf (<0.6)',
  ]
  const lines = results.map((r) => [
    r.label,
    String(r.score.rows),
    String(r.score.answered),
    formatPercent(r.coverageWithoutAi),
    formatPercent(r.score.categoryAccuracy),
    formatPercent(r.score.nameMatchRate),
    String(r.aiCalls),
    String(approxTokens(r.promptChars)),
    r.lowConfidence === null ? '-' : String(r.lowConfidence),
  ])
  const widths = header.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i]!.length)))
  const fmt = (cells: string[]): string => cells.map((c, i) => c.padEnd(widths[i]!)).join('  ')
  console.log(fmt(header))
  console.log(widths.map((w) => '-'.repeat(w)).join('  '))
  for (const line of lines) console.log(fmt(line))
}

async function main(): Promise<void> {
  const user = await findUser(values.user!)
  const countryCode = (user.country === 'US' ? 'US' : 'IN') as CountryCode
  const all = await loadRows(user.id)

  const truthRows = all.filter((r) => r.categorySource === 'user' || r.categorySource === 'rule')
  if (truthRows.length === 0) fail('No ground-truth transactions (category set by you or a rule)')

  const split =
    values['split-date'] ??
    splitDate(
      truthRows.map((r) => r.date),
      SPLIT_QUANTILE
    )!
  const train = all.filter((r) => r.date < split)
  const candidates = truthRows.filter((r) => r.date >= split)
  const test: TestRow[] = seededSample(candidates, limit, SAMPLE_SEED).map((r) => ({
    id: r.id,
    date: r.date,
    amount: r.amount,
    type: r.type as 'credit' | 'debit',
    description: r.description,
    fingerprint: r.fingerprint,
    truth: { category: r.category, name: r.name },
  }))
  if (test.length === 0) fail(`No ground-truth transactions on or after ${split}`)

  const memory = buildMemory(train, split)
  const truths = test.map((t) => t.truth)
  console.error(
    `User ${user.id}, country ${countryCode}: ${all.length} labelled transactions, ${truthRows.length} ground truth.`
  )
  console.error(
    `Split ${split}: memory from ${train.length} earlier rows (${memory.size} merchants), testing ${test.length} of ${candidates.length} later rows.`
  )

  // Arm A: memory only
  const lookups = test.map((t) => lookupMemory(memory, t.fingerprint, t.type))
  const memoryAnswers: EvalAnswer[] = lookups.map((found) => {
    return found
      ? { category: found.resolved.category, name: found.resolved.name }
      : { category: null, name: null }
  })
  const looseCount = lookups.filter((found) => found?.match === 'loose').length
  const results: ArmResult[] = [
    {
      label: 'A memory only',
      score: scoreArm(memoryAnswers, truths),
      coverageWithoutAi: memoryAnswers.filter((a) => a.category !== null).length / test.length,
      aiCalls: 0,
      promptChars: 0,
      lowConfidence: null,
    },
  ]

  if (!values['no-ai']) {
    const llm = await createLLMClientFromSettings(values.model, 'categorization')
    const categories = getCategoriesForCountry(countryCode)
    const validCategories = categories.map((c) => c.code)
    const categoryList = formatCategoryList(categories)

    // Arm B: the prompt as it was before learning
    console.error('Arm B: old prompt')
    const old = await runAi(
      test,
      countryCode,
      validCategories,
      categoryList,
      llm,
      undefined,
      memory
    )
    results.push({
      label: 'B old prompt',
      score: scoreArm(
        test.map((t) => old.answers.get(t.id) ?? { category: null, name: null }),
        truths
      ),
      coverageWithoutAi: 0,
      aiCalls: old.calls,
      promptChars: old.chars,
      lowConfidence: old.lowConfidence,
    })

    // Arm C: memory first, then the AI with past decisions and corrections
    console.error('Arm C: new pipeline')
    const corrections = formatCorrections(
      await loadCorrectionsBefore(user.id, new Date(split).getTime())
    )
    const learning: LearningContext = { memory, corrections }
    const remaining = test.filter((_, i) => memoryAnswers[i]!.category === null)
    const fresh = await runAi(
      remaining,
      countryCode,
      validCategories,
      categoryList,
      llm,
      learning,
      memory
    )
    const pipelineAnswers = test.map(
      (t, i) =>
        (memoryAnswers[i]!.category !== null ? memoryAnswers[i]! : fresh.answers.get(t.id)) ?? {
          category: null,
          name: null,
        }
    )
    results.push({
      label: 'C new pipeline',
      score: scoreArm(pipelineAnswers, truths),
      coverageWithoutAi: (test.length - remaining.length) / test.length,
      aiCalls: fresh.calls,
      promptChars: fresh.chars,
      lowConfidence: fresh.lowConfidence,
    })
  }

  console.log(
    `\nSplit date ${split}; ${test.length} test rows; ${memory.size} merchants in memory\n`
  )
  printTable(results)
  console.log(`\nMemory answered ${looseCount} of ${test.length} rows by loose name match.`)
  console.log(
    '\nAccuracy and name match are over answered rows. Prompt tokens are approximate (chars / 4).'
  )
}

await main()
process.exit(0)
