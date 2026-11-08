import { toCsv } from '../lib/csv'
import { getTransactions, type TransactionFilters } from './transactions'

const PAGE_SIZE = 1000

const HEADER = [
  'Date',
  'Type',
  'Amount',
  'Currency',
  'Name',
  'Original description',
  'Category',
  'Account ID',
  'Profile ID',
  'Subscription',
  'Hidden',
  'Notes',
]

/** Every transaction matching the filters, oldest first, as CSV text */
export async function exportTransactionsCsv(
  userId: string,
  filters: TransactionFilters
): Promise<string> {
  const rows: (string | number | boolean | null)[][] = []

  for (let page = 1; ; page++) {
    const result = await getTransactions(userId, filters, {
      page,
      limit: PAGE_SIZE,
      sortBy: 'date',
      sortOrder: 'asc',
    })
    for (const t of result.transactions) {
      rows.push([
        t.date,
        t.type,
        t.amount,
        t.currency,
        t.summary,
        t.originalDescription,
        t.category,
        t.accountId,
        t.profileId,
        t.isSubscription,
        t.isHidden,
        t.notes,
      ])
    }
    if (page * PAGE_SIZE >= result.total || result.transactions.length === 0) break
  }

  return toCsv(HEADER, rows)
}
