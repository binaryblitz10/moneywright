/**
 * CSV helpers shared by the LLM transaction prompts (categorization and renaming)
 */

import { streamText } from 'ai'
import type { LLMClientResult } from '../../llm'

/**
 * Parse CSV line handling quoted fields
 */
export function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current)

  return fields.map((f) => f.trim())
}

/**
 * Stream an LLM response and hand each complete CSV line to `onLine` as it arrives.
 * Blank lines and the header line (starting with "id,") are skipped.
 * Rejects if the stream errors or runs past `timeoutMs`.
 */
export async function streamCsvLines(
  llmClient: LLMClientResult,
  system: string,
  prompt: string,
  onLine: (line: string) => Promise<void>,
  timeoutMs: number
): Promise<void> {
  const abortSignal = AbortSignal.timeout(timeoutMs)
  let streamError: unknown
  const { textStream } = streamText({
    model: llmClient.model,
    system,
    prompt,
    providerOptions: llmClient.providerOptions,
    abortSignal,
    onError: ({ error }) => {
      streamError = error
    },
  })

  let buffer = ''

  for await (const chunk of textStream) {
    buffer += chunk

    // Process complete lines immediately as they arrive
    const lines = buffer.split('\n')
    buffer = lines.pop() || '' // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim() || line.toLowerCase().startsWith('id,')) continue
      await onLine(line)
    }
  }

  // streamText ends quietly on abort or error, so surface both as a rejection
  if (abortSignal.aborted) throw new Error(`AI request timed out after ${timeoutMs / 1000}s`)
  if (streamError) throw streamError instanceof Error ? streamError : new Error(String(streamError))

  // Process remaining buffer (last line without newline)
  if (buffer.trim() && !buffer.toLowerCase().startsWith('id,')) {
    await onLine(buffer)
  }
}

/**
 * Format a transaction description as a quoted CSV field
 */
export function quoteCSVField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}
