/** Date handling for bank alert messages */

const DAY_MS = 24 * 60 * 60 * 1000
/** A stated date this far from the arrival day is not trusted (a mis-read or a day/month mix-up) */
const MAX_STATED_DAYS_BEFORE_ARRIVAL = 7

/** Local calendar date (YYYY-MM-DD) of an ISO timestamp */
export function localDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * The date to book a transaction on: the date stated in the message when it is plausible (not
 * after the day the message arrived, and at most a week before it), otherwise the arrival day.
 */
export function pickTransactionDate(stated: string | null, receivedAtIso: string): string {
  const arrival = localDate(receivedAtIso)
  if (!stated) return arrival

  const daysBefore = (Date.parse(arrival) - Date.parse(stated)) / DAY_MS
  return daysBefore >= 0 && daysBefore <= MAX_STATED_DAYS_BEFORE_ARRIVAL ? stated : arrival
}
