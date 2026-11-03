/**
 * Sandboxed execution of LLM-generated parser code
 *
 * Supports two execution modes:
 * 1. E2B Sandbox (preferred) - Full VM isolation via E2B cloud
 * 2. Local Worker (fallback) - Runs in a terminable Bun Worker with validation
 *
 * E2B is used when E2B_API_KEY is configured, otherwise falls back to local execution.
 */

import { logger } from '../logger'
import { validateCode, checkSyntax } from './validate-code'
import type { ParserWorkerRequest, ParserWorkerResponse } from './parser-worker'
import { isE2BConfigured, runParserInE2B, type ParsingMode } from './e2b-executor'
import type {
  RawPdfTransaction,
  RawInvestmentHolding,
  ExecutionResult,
  ExpectedSummary,
} from './types'
import type { ParserCodeEntry } from './parser-code-cache'
import { recordSuccess, recordFailure } from './parser-code-cache'
import {
  MAX_ITEMS,
  isValidTransaction,
  normalizeTransaction,
  isValidHolding,
  normalizeHolding,
  validateParsedTransactions,
  type ParsedValidation,
} from './validation'

/**
 * Maximum execution time in milliseconds
 */
const EXECUTION_TIMEOUT_MS = 5000

/**
 * Maximum number of transactions to extract
 */
const MAX_TRANSACTIONS = MAX_ITEMS

/**
 * Run the generated parser code
 *
 * Uses E2B sandbox if configured (E2B_API_KEY set), otherwise falls back to local execution.
 * E2B provides full VM isolation, local execution uses Function constructor with validation.
 *
 * @param parserCode - The parser code to execute
 * @param pdfText - The text to parse
 * @param mode - 'transaction' for bank statements, 'holding' for investment statements
 */
export async function runParser(
  parserCode: string,
  pdfText: string,
  mode: ParsingMode = 'transaction'
): Promise<ExecutionResult> {
  // Use E2B if configured
  if (isE2BConfigured()) {
    logger.debug(`[ExecuteParser] Using E2B sandbox for code execution (mode: ${mode})`)
    return runParserInE2B(parserCode, pdfText, mode)
  }

  // Fallback to local execution
  logger.debug(`[ExecuteParser] Using local execution (mode: ${mode}, E2B not configured)`)
  return runParserLocal(parserCode, pdfText, mode)
}

/**
 * Run the parser code in a Worker and wait for its result
 *
 * The worker is terminated on completion or timeout, so infinite loops or
 * catastrophic regexes cannot block the API server.
 */
function runInWorker(parserCode: string, pdfText: string, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./parser-worker.ts', import.meta.url))
    const timer = setTimeout(() => finish(() => reject(new Error('Execution timeout'))), timeoutMs)

    function finish(settle: () => void): void {
      clearTimeout(timer)
      worker.terminate()
      settle()
    }

    worker.onmessage = (event: MessageEvent<ParserWorkerResponse>) => {
      const response = event.data
      finish(() => (response.ok ? resolve(response.result) : reject(new Error(response.error))))
    }
    worker.onerror = (event) => {
      event.preventDefault()
      finish(() => reject(new Error(event.message || 'Parser worker crashed')))
    }

    const request: ParserWorkerRequest = { code: parserCode, text: pdfText }
    worker.postMessage(request)
  })
}

/**
 * Run parser code locally in a Worker
 *
 * SECURITY NOTE: This intentionally runs dynamic code. Security is enforced by:
 * - Pre-validation via validateCode() and checkSyntax()
 * - Isolation in a Worker that is terminated on timeout (see parser-worker.ts
 *   for the restricted globals; this is not a full sandbox)
 * - Output validation
 */
export async function runParserLocal(
  parserCode: string,
  pdfText: string,
  mode: ParsingMode = 'transaction',
  timeoutMs: number = EXECUTION_TIMEOUT_MS
): Promise<ExecutionResult> {
  const startTime = Date.now()

  // Step 1: Validate code for dangerous patterns
  const validation = validateCode(parserCode)
  if (!validation.valid) {
    logger.error(`[ExecuteParser] Code validation failed. Generated code:\n${parserCode}`)
    return {
      success: false,
      error: `Code validation failed: ${validation.errors.join('; ')}`,
      executionTimeMs: Date.now() - startTime,
    }
  }

  // Step 2: Check syntax
  const syntaxCheck = checkSyntax(parserCode)
  if (!syntaxCheck.valid) {
    return {
      success: false,
      error: `Syntax error: ${syntaxCheck.error}`,
      executionTimeMs: Date.now() - startTime,
    }
  }

  // Step 3: Run in a terminable worker with a timeout
  try {
    const result = await runInWorker(parserCode, pdfText, timeoutMs)

    const executionTimeMs = Date.now() - startTime

    // Step 5: Validate output
    if (!Array.isArray(result)) {
      return {
        success: false,
        error: 'Parser did not return an array',
        executionTimeMs,
      }
    }

    // Filter and validate based on mode
    if (mode === 'holding') {
      // Validate as investment holdings
      const validHoldings: RawInvestmentHolding[] = []
      let invalidCount = 0

      for (const item of result) {
        if (validHoldings.length >= MAX_TRANSACTIONS) {
          logger.warn(`[ExecuteParser] Reached max holding limit (${MAX_TRANSACTIONS})`)
          break
        }

        if (isValidHolding(item)) {
          validHoldings.push(normalizeHolding(item))
        } else {
          invalidCount++
        }
      }

      if (invalidCount > 0) {
        logger.warn(`[ExecuteParser] Skipped ${invalidCount} invalid holdings`)
      }

      logger.debug(
        `[ExecuteParser] Extracted ${validHoldings.length} holdings in ${executionTimeMs}ms`
      )

      return {
        success: true,
        holdings: validHoldings,
        executionTimeMs,
      }
    } else {
      // Validate as bank transactions
      const validTransactions: RawPdfTransaction[] = []
      let invalidCount = 0

      for (const item of result) {
        if (validTransactions.length >= MAX_TRANSACTIONS) {
          logger.warn(`[ExecuteParser] Reached max transaction limit (${MAX_TRANSACTIONS})`)
          break
        }

        if (isValidTransaction(item)) {
          validTransactions.push(normalizeTransaction(item))
        } else {
          invalidCount++
        }
      }

      if (invalidCount > 0) {
        logger.warn(`[ExecuteParser] Skipped ${invalidCount} invalid transactions`)
      }

      logger.debug(
        `[ExecuteParser] Extracted ${validTransactions.length} transactions in ${executionTimeMs}ms`
      )

      return {
        success: true,
        transactions: validTransactions,
        droppedRowCount: invalidCount,
        executionTimeMs,
      }
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown execution error',
      executionTimeMs: Date.now() - startTime,
    }
  }
}

/**
 * Result from trying multiple parser versions
 */
export interface MultiVersionResult extends ExecutionResult {
  usedVersion?: number
  triedVersions: number[]
  /** How the rows were checked, and what was off. Absent when no version produced rows. */
  validation?: ParsedValidation
}

/**
 * Try multiple parser code versions until one succeeds AND passes validation
 * Tries versions in order (should be sorted latest first)
 * Records success/failure for each version tried
 *
 * @param parserCodes - Array of parser code entries to try
 * @param pdfText - The PDF text to parse
 * @param bankKey - Bank identifier for logging and recording stats
 * @param expectedSummary - Optional expected summary for validation
 */
export async function runParserWithVersions(
  parserCodes: ParserCodeEntry[],
  pdfText: string,
  bankKey: string,
  expectedSummary?: ExpectedSummary
): Promise<MultiVersionResult> {
  const triedVersions: number[] = []

  for (const entry of parserCodes) {
    triedVersions.push(entry.version)
    logger.debug(`[ExecuteParser] Trying ${bankKey} v${entry.version}...`)

    const result = await runParser(entry.code, pdfText)

    if (result.success && result.transactions && result.transactions.length > 0) {
      // Execution succeeded; judge the rows by printed totals or, failing that, the running balance
      const validation = validateParsedTransactions(expectedSummary ?? null, result.transactions)

      if (validation.passed) {
        await recordSuccess(bankKey, entry.version)
        logger.debug(
          `[ExecuteParser] ${bankKey} v${entry.version} succeeded with ${result.transactions.length} transactions (validation: ${validation.method})`
        )
        return { ...result, usedVersion: entry.version, triedVersions, validation }
      }

      // Execution succeeded but validation failed - try next version
      await recordFailure(bankKey, entry.version)
      logger.warn(
        `[ExecuteParser] ${bankKey} v${entry.version} failed validation (${validation.method}): ${validation.issues.join(', ')}`
      )
    } else {
      // Execution failed, record and try next version
      await recordFailure(bankKey, entry.version)
      logger.warn(
        `[ExecuteParser] ${bankKey} v${entry.version} failed: ${result.error || 'No transactions found'}`
      )
    }
  }

  // All versions failed (either execution or validation)
  return {
    success: false,
    error: `All ${parserCodes.length} cached parser versions failed execution or validation`,
    executionTimeMs: 0,
    triedVersions,
  }
}
