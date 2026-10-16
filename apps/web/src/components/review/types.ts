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
}
