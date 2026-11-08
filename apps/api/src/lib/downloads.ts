/**
 * Saving files to the user's Downloads folder (the desktop app cannot trigger browser downloads)
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

/** Pick a file name that does not overwrite an existing file: name.ext, name-2.ext, ... */
export function uniqueFileName(
  base: string,
  ext: string,
  exists: (fileName: string) => boolean
): string {
  let fileName = `${base}.${ext}`
  for (let n = 2; exists(fileName); n++) fileName = `${base}-${n}.${ext}`
  return fileName
}

/** Write the bytes to Downloads, show the file in the file manager, and return its path */
export function saveToDownloads(base: string, ext: string, data: Uint8Array | string): string {
  const dir = join(homedir(), 'Downloads')
  mkdirSync(dir, { recursive: true })
  const file = join(
    dir,
    uniqueFileName(base, ext, (f) => existsSync(join(dir, f)))
  )
  writeFileSync(file, data)
  revealInFileManager(file, dir)
  return file
}

function revealInFileManager(file: string, dir: string): void {
  const command =
    process.platform === 'darwin'
      ? ['open', '-R', file]
      : process.platform === 'win32'
        ? ['explorer', `/select,${file}`]
        : ['xdg-open', dir]
  try {
    Bun.spawn(command, { stdout: 'ignore', stderr: 'ignore' })
  } catch {
    // Showing the file is a convenience; the save itself succeeded
  }
}
