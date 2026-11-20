import type { Account, Category, Profile, Transaction, TransactionFilters } from '@/lib/api'

/** Props both review panels need to render transaction tables */
export interface ReviewPanelProps {
  /** Shared filters (including profileId and enabled) from the page's filter bar */
  filters: TransactionFilters & { enabled?: boolean }
  accounts: Account[]
  categories: Category[]
  countryCode: string
  profiles?: Profile[]
  showProfileBadge?: boolean
  onEditTransaction: (transaction: Transaction) => void
  getCategoryLabel: (code: string) => string
  formatAmount: (amount: number, currency: string) => string
  /** A shorter empty state, for the dashboard widget */
  compact?: boolean
  /** History only: show just the fixes made after importing this statement */
  statementId?: string
  /** History only: leave the single-statement view */
  onClearBatch?: () => void
}
