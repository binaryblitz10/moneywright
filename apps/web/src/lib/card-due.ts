import type { Account } from '@/lib/api'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const SOON_DAYS = 5

export type CardDueTone = 'neutral' | 'positive' | 'warning' | 'negative'

export interface CardDueStatus {
  tone: CardDueTone
  label: string
  /** Secondary line, e.g. the due date or when the statement closes */
  detail: string | null
  /** Unpaid part of the latest statement, when a payment is still expected */
  amountDue: number | null
  minimumDue: number | null
}

function toDay(date: string): number {
  return Date.parse(`${date.slice(0, 10)}T00:00:00Z`)
}

function todayUtcDay(): number {
  const now = new Date()
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
}

function formatDay(date: string): string {
  return new Date(toDay(date)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

/**
 * Payment status of a credit card's latest statement. Nothing is due while today still falls
 * within the statement period, since that statement is not billed yet.
 */
export function getCardDueStatus(
  account: Pick<Account, 'statementBalance' | 'paymentsSinceStatement' | 'cardStatement'>
): CardDueStatus | null {
  const info = account.cardStatement
  if (!info || account.statementBalance == null) return null

  const today = todayUtcDay()
  const unpaid = Math.max(account.statementBalance - (account.paymentsSinceStatement ?? 0), 0)
  const settled = unpaid < 1

  if (info.periodStart && info.periodEnd) {
    const inCycle = toDay(info.periodStart) <= today && today <= toDay(info.periodEnd)
    if (inCycle) {
      return {
        tone: 'neutral',
        label: 'Not due yet',
        detail: `Statement closes ${formatDay(info.periodEnd)}`,
        amountDue: null,
        minimumDue: null,
      }
    }
  }

  if (settled) {
    return {
      tone: 'positive',
      label: account.statementBalance > 0 ? 'Statement paid' : 'Nothing due',
      detail: info.dueDate ? `Was due ${formatDay(info.dueDate)}` : null,
      amountDue: null,
      minimumDue: null,
    }
  }

  if (!info.dueDate) return null

  const days = Math.round((toDay(info.dueDate) - today) / MS_PER_DAY)
  const minimumDue = account.paymentsSinceStatement ? null : info.minimumDue
  const dateText = formatDay(info.dueDate)

  if (days < 0) {
    const late = -days
    return {
      tone: 'negative',
      label: `Overdue by ${late} ${late === 1 ? 'day' : 'days'}`,
      detail: `Was due ${dateText}`,
      amountDue: unpaid,
      minimumDue,
    }
  }
  return {
    tone: days <= SOON_DAYS ? 'warning' : 'neutral',
    label: days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days} days`,
    detail: `Due ${dateText}`,
    amountDue: unpaid,
    minimumDue,
  }
}
