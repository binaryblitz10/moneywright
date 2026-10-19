/**
 * Worker that runs LLM-generated parser code off the main thread.
 *
 * Running in a Worker lets the caller terminate runaway code (infinite loops,
 * catastrophic regex backtracking) that would otherwise freeze the API server.
 *
 * Reachable globals are reduced (defense in depth, not a full sandbox):
 * - Dangerous globals are not passed to the parser function, so its parameters
 *   of the same name are `undefined` and direct references resolve to undefined.
 * - They are also deleted from the worker's globalThis, so indirect access
 *   (e.g. `''.constructor.constructor('return process')()`) finds nothing.
 * - Known gap: `Bun` is a non-configurable, read-only global in workers, so it
 *   remains reachable through indirect access. The worker only guarantees
 *   termination on timeout, not isolation from Bun APIs.
 */

declare const self: Worker

export interface ParserWorkerRequest {
  code: string
  text: string
}

export type ParserWorkerResponse = { ok: true; result: unknown } | { ok: false; error: string }

const RESTRICTED_GLOBALS = [
  'process',
  'Bun',
  'Deno',
  'fetch',
  'WebSocket',
  'XMLHttpRequest',
  'EventSource',
  'Worker',
  'SharedWorker',
  'BroadcastChannel',
  'MessageChannel',
  'require',
  'module',
  'exports',
  'importScripts',
  'postMessage',
  'onmessage',
  'addEventListener',
  'removeEventListener',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'queueMicrotask',
]

// Keep references before the globals are removed
const post = self.postMessage.bind(self)
const FnConstructor = Function

function restrictGlobals(): void {
  const scope = globalThis as unknown as Record<string, unknown>
  for (const name of RESTRICTED_GLOBALS) {
    try {
      delete scope[name]
    } catch {
      // Some globals (e.g. Bun) cannot be deleted; overwrite them instead
      try {
        scope[name] = undefined
      } catch {
        // Still shadowed by the function parameters for direct references
      }
    }
  }
}

async function run({ code, text }: ParserWorkerRequest): Promise<ParserWorkerResponse> {
  try {
    // Only 'text' is bound to a real value; every restricted name is an undefined parameter
    const parserFn = FnConstructor('text', ...RESTRICTED_GLOBALS, `"use strict";\n${code}`) as (
      text: string
    ) => unknown
    const result = await parserFn(text)
    // Fail here if the result cannot be structured-cloned
    structuredClone(result)
    return { ok: true, result }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown execution error' }
  }
}

self.onmessage = (event: MessageEvent<ParserWorkerRequest>) => {
  const request = event.data
  restrictGlobals()
  void run(request).then((response) => post(response))
}
