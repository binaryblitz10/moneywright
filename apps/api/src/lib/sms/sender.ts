/**
 * How much a message sender looks like a bank, learned from the user's own messages: senders whose
 * messages were matched with a statement (verified) count for, senders the user dismissed count
 * against. Nothing is hard coded, so it works for any bank. Pure functions, no I/O.
 */

/** unknown: nothing verified yet, so no opinion. bank / vendor: what the history says. */
export type SenderTrust = 'unknown' | 'bank' | 'vendor'

/** Messages per sender */
export type SenderCounts = Map<string, number>

/** Senders at least this alike share a track record (AMEXIN-S and AMEXIN-T, AX-AXISBK-S and VM-AXISBK-P) */
const CLOSE_SIMILARITY = 0.7

function normalize(sender: string): string {
  return sender.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** The longest word of the sender: the bank's name between a route prefix and a type suffix */
function core(sender: string): string {
  return sender
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .reduce((longest, word) => (word.length > longest.length ? word : longest), '')
}

function editSimilarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length)
  if (longest === 0) return 0

  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row.push(Math.min(previous[j]! + 1, row[j - 1]! + 1, previous[j - 1]! + cost))
    }
    previous = row
  }
  return 1 - previous[b.length]! / longest
}

/** 0 to 1: how alike two sender addresses are. Phone numbers only match exactly. */
export function senderSimilarity(a: string, b: string): number {
  if (/^[+\d\s-]+$/.test(a) || /^[+\d\s-]+$/.test(b)) {
    return normalize(a) === normalize(b) ? 1 : 0
  }
  return Math.max(editSimilarity(normalize(a), normalize(b)), editSimilarity(core(a), core(b)))
}

/** The evidence for or against a sender: each known sender's message count, weighted by likeness */
function evidence(sender: string, counts: SenderCounts): number {
  let total = 0
  for (const [known, count] of counts) {
    const similarity = senderSimilarity(sender, known)
    if (similarity >= CLOSE_SIMILARITY) total += similarity * count
  }
  return total
}

/**
 * Whether a sender looks like a bank. With nothing verified yet there is nothing to compare with.
 * Otherwise it is a bank when verified messages from alike senders outweigh dismissed ones, and a
 * vendor (or an unseen sender) when they do not.
 */
export function senderTrust(
  sender: string,
  verified: SenderCounts,
  dismissed: SenderCounts
): SenderTrust {
  if (verified.size === 0) return 'unknown'
  return evidence(sender, verified) > evidence(sender, dismissed) ? 'bank' : 'vendor'
}
