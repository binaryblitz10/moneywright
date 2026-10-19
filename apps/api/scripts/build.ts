/**
 * Build script for the API
 * Bundles the API into a single file for production
 */

import { join } from 'path'

const rootDir = join(import.meta.dir, '..')
const distDir = join(rootDir, 'dist')

console.log('Building API...')

const commonOptions = {
  outdir: distDir,
  target: 'bun',
  format: 'esm',
  minify: false,
  external: ['better-sqlite3', 'postgres'],
} as const

const results = [
  await Bun.build({
    ...commonOptions,
    entrypoints: [join(rootDir, 'src/index.ts')],
    sourcemap: 'external',
  }),
  // The parser worker is loaded at runtime via `new Worker(new URL('./parser-worker.ts', ...))`,
  // so it must sit next to index.js under that exact name (the content is bundled JavaScript)
  await Bun.build({
    ...commonOptions,
    entrypoints: [join(rootDir, 'src/lib/pdf/parser-worker.ts')],
    naming: '[name].ts',
  }),
]

for (const result of results) {
  if (!result.success) {
    console.error('Build failed:')
    for (const log of result.logs) {
      console.error(log)
    }
    process.exit(1)
  }
}

console.log('Build complete!')
console.log(`Output: ${distDir}`)
