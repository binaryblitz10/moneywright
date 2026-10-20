import type { Account } from '@/lib/api'

const OVERDUE_AFTER_DAYS = 30
const MS_PER_DAY = 24 * 60 * 60 * 1000

/** An active account whose latest statement ended more than 30 days ago */
export function isStatementOverdue(
  account: Pick<Account, 'isActive' | 'latestStatementDate'> | undefined
): boolean {
  if (!account?.isActive || !account.latestStatementDate) return false
  const daysSince = (Date.now() - new Date(account.latestStatementDate).getTime()) / MS_PER_DAY
  return daysSince > OVERDUE_AFTER_DAYS
}
