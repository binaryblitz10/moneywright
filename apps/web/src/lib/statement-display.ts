import type { Account, Statement } from '@/lib/api'

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function formatDate(value: string, options: Intl.DateTimeFormatOptions): string {
  // Date-only strings are UTC midnight; format them in UTC so the day never shifts
  return new Date(value).toLocaleDateString('en-GB', {
    ...options,
    ...(DATE_ONLY.test(value) && { timeZone: 'UTC' }),
  })
}

/** When the statement ends, falling back to the upload date */
export function getStatementDate(statement: Statement): string {
  return statement.periodEnd ?? statement.createdAt
}

/** "Mar 2025" for a single-month period, "15 Feb – 14 Mar 2025" for a spanning one */
export function getStatementPeriodLabel(statement: Statement): string {
  const { periodStart, periodEnd } = statement
  const month = { month: 'short', year: 'numeric' } as const
  if (!periodEnd) return formatDate(statement.createdAt, month)
  if (!periodStart) return formatDate(periodEnd, month)

  const startMonth = formatDate(periodStart, month)
  const endMonth = formatDate(periodEnd, month)
  if (startMonth === endMonth) return endMonth

  const day = { day: 'numeric', month: 'short' } as const
  return `${formatDate(periodStart, day)} – ${formatDate(periodEnd, { ...day, year: 'numeric' })}`
}

/** Short account name with its last four digits, e.g. "HDFC ••1234" */
export function getAccountShortLabel(account: Account, institutionName?: string): string {
  const name =
    account.type === 'credit_card'
      ? account.productName || account.accountName || institutionName || 'Credit Card'
      : institutionName || account.accountName || 'Bank Account'
  const lastFour = account.accountNumber?.slice(-4)
  return lastFour ? `${name} ••${lastFour}` : name
}

/** Remove the file extension from a filename */
export function stripExtension(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '')
}
