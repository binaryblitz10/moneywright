/**
 * Native desktop notifications (macOS only, via osascript). Failures are logged, never thrown.
 */

import { logger } from './logger'

/** Quote a value for use inside an AppleScript string literal */
function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function showNotification(title: string, message: string): void {
  if (process.platform !== 'darwin') return
  try {
    const script = `display notification ${quote(message)} with title ${quote(title)}`
    Bun.spawn(['osascript', '-e', script], { stdout: 'ignore', stderr: 'ignore' })
  } catch (error) {
    logger.error('[Notify] Could not show notification:', error)
  }
}
