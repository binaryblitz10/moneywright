/**
 * Read-only access to the macOS Messages database (~/Library/Messages/chat.db).
 * Reading it needs the Full Disk Access permission. iMessage conversations are never read:
 * only SMS / RCS messages, which is where bank alerts arrive.
 */

import { Database } from 'bun:sqlite'
import { homedir } from 'os'
import { join } from 'path'

export interface IncomingMessage {
  rowId: number
  guid: string
  sender: string
  body: string
  receivedAt: string // ISO timestamp
}

export type MessagesAccess = 'ok' | 'permission_denied' | 'not_found'

interface MessageRow {
  rowId: number
  guid: string
  text: string | null
  attributedBody: Uint8Array | null
  date: number
  sender: string | null
}

const CHAT_DB_PATH = join(homedir(), 'Library', 'Messages', 'chat.db')
const APPLE_EPOCH_MS = Date.UTC(2001, 0, 1)
export const MESSAGE_BATCH_SIZE = 500

/** Classify why chat.db could not be opened */
function accessErrorToStatus(error: unknown): MessagesAccess {
  const text = `${(error as { code?: string })?.code ?? ''} ${(error as Error)?.message ?? ''}`
  return /ENOENT|no such file/i.test(text) ? 'not_found' : 'permission_denied'
}

function openChatDb(): Database {
  return new Database(CHAT_DB_PATH, { readonly: true })
}

/** Whether the Messages database can be read right now */
export function checkMessagesAccess(): MessagesAccess {
  try {
    const database = openChatDb()
    try {
      database.query('SELECT 1 FROM message LIMIT 1').get()
    } finally {
      database.close()
    }
    return 'ok'
  } catch (error) {
    return accessErrorToStatus(error)
  }
}

/**
 * Newer macOS versions keep the text only in the `attributedBody` blob (a typedstream archive):
 * the string follows the `NSString` marker as `0x01 0x2b` plus a length prefix.
 */
export function decodeAttributedBody(blob: Uint8Array | null): string | null {
  if (!blob) return null
  const buffer = Buffer.from(blob)
  const marker = buffer.indexOf('NSString')
  if (marker < 0) return null

  let pos = buffer.indexOf(Buffer.from([0x01, 0x2b]), marker)
  if (pos < 0) return null
  pos += 2

  let length = buffer[pos]
  pos += 1
  if (length === undefined) return null
  if (length === 0x81) {
    length = buffer.readUInt16LE(pos)
    pos += 2
  } else if (length === 0x82) {
    length = buffer.readUInt32LE(pos)
    pos += 4
  }
  const text = buffer.subarray(pos, pos + length).toString('utf8')
  return text || null
}

/** Message dates are seconds (old macOS) or nanoseconds (new macOS) since 2001-01-01 */
export function appleDateToIso(value: number): string {
  const seconds = value > 1e11 ? value / 1e9 : value
  return new Date(APPLE_EPOCH_MS + seconds * 1000).toISOString()
}

/** Highest message ROWID, used to start reading from "now" when the feature is switched on */
export function getLatestRowId(): number {
  const database = openChatDb()
  try {
    const row = database.query('SELECT MAX(ROWID) AS maxId FROM message').get() as {
      maxId: number | null
    } | null
    return row?.maxId ?? 0
  } finally {
    database.close()
  }
}

/**
 * Incoming SMS / RCS messages after `afterRowId`, oldest first. With `since`, only messages
 * received at or after that time.
 */
export function readMessagesAfter(afterRowId: number, since?: Date): IncomingMessage[] {
  const sinceSeconds = since ? (since.getTime() - APPLE_EPOCH_MS) / 1000 : -Infinity
  const database = openChatDb()
  try {
    const rows = database
      .query(
        `SELECT m.ROWID AS rowId, m.guid AS guid, m.text AS text,
                m.attributedBody AS attributedBody, m.date AS date, h.id AS sender
         FROM message m
         LEFT JOIN handle h ON h.ROWID = m.handle_id
         WHERE m.ROWID > ? AND m.is_from_me = 0 AND m.service != 'iMessage'
           AND (CASE WHEN m.date > 1e11 THEN m.date / 1e9 ELSE m.date END) >= ?
         ORDER BY m.ROWID
         LIMIT ?`
      )
      .all(afterRowId, sinceSeconds, MESSAGE_BATCH_SIZE) as MessageRow[]

    return rows.flatMap((row) => {
      const body = row.text ?? decodeAttributedBody(row.attributedBody)
      return body
        ? [
            {
              rowId: row.rowId,
              guid: row.guid,
              sender: row.sender ?? 'Unknown',
              body,
              receivedAt: appleDateToIso(row.date),
            },
          ]
        : []
    })
  } finally {
    database.close()
  }
}
