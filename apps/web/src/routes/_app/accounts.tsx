import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ProfileSelector } from '@/components/domain/profile-selector'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Building2, CreditCard, Search, Upload } from 'lucide-react'
import { CardSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { QueryError } from '@/components/ui/query-error'
import { SearchSortBar, type SortChoice } from '@/components/ui/search-sort-bar'
import type { Account, Statement } from '@/lib/api'
import {
  useAuth,
  useAccounts,
  useAccountTypes,
  useDeleteAccount,
  useStatements,
  useConstants,
  useProfileSelection,
} from '@/hooks'
import {
  BankAccountCard,
  CreditCardDisplay,
  CreditCardDetailModal,
  AccountForm,
} from '@/components/accounts'
import { RecategorizeModal } from '@/components/transactions/recategorize-modal'

export const Route = createFileRoute('/_app/accounts')({
  component: AccountsPage,
})

type AccountSort = 'default' | 'name_asc' | 'name_desc' | 'balance_desc' | 'balance_asc' | 'type'

const ACCOUNT_SORT_OPTIONS: SortChoice<AccountSort>[] = [
  { value: 'default', label: 'Default order' },
  { value: 'name_asc', label: 'Name (A-Z)' },
  { value: 'name_desc', label: 'Name (Z-A)' },
  { value: 'balance_desc', label: 'Balance (High to low)' },
  { value: 'balance_asc', label: 'Balance (Low to high)' },
  { value: 'type', label: 'Type' },
]

function accountDisplayName(account: Account): string {
  return account.accountName || account.institution || ''
}

function sortAccounts(list: Account[], sort: AccountSort): Account[] {
  if (sort === 'default') return list
  return [...list].sort((a, b) => {
    switch (sort) {
      case 'name_asc':
        return accountDisplayName(a).localeCompare(accountDisplayName(b))
      case 'name_desc':
        return accountDisplayName(b).localeCompare(accountDisplayName(a))
      case 'balance_desc':
        return (b.latestBalance ?? -Infinity) - (a.latestBalance ?? -Infinity)
      case 'balance_asc':
        return (a.latestBalance ?? Infinity) - (b.latestBalance ?? Infinity)
      default:
        return a.type.localeCompare(b.type)
    }
  })
}

function AccountsPage() {
  const queryClient = useQueryClient()
  const { user, profiles } = useAuth()
  const {
    activeProfileId,
    showFamilyView,
    selectorProfileId,
    handleProfileChange,
    handleFamilyViewChange,
  } = useProfileSelection()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<AccountSort>('default')
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [recategorizeAccount, setRecategorizeAccount] = useState<Account | null>(null)
  const [selectedCreditCard, setSelectedCreditCard] = useState<Account | null>(null)
  const countryCode = user?.country?.toLowerCase() || 'in'
  const currencySymbol = user?.country === 'US' ? '$' : user?.country === 'GB' ? '£' : '₹'

  // Query enabled when we have a profileId OR we're in family view
  const queryEnabled = !!activeProfileId || showFamilyView

  // Query hooks
  const {
    data: accounts,
    isLoading: accountsLoading,
    isError,
    error,
    refetch,
  } = useAccounts(activeProfileId, { enabled: queryEnabled })
  const { data: accountTypes } = useAccountTypes()
  const { data: statements } = useStatements(activeProfileId, { enabled: queryEnabled })
  const { institutions } = useConstants()

  // Mutation hooks
  const deleteMutation = useDeleteAccount(activeProfileId)

  // Create map of accountId -> latest statement for quick lookup
  const statementsByAccount = new Map<string, Statement>()
  statements?.forEach((s) => {
    if (s.accountId) {
      const existing = statementsByAccount.get(s.accountId)
      if (!existing || new Date(s.createdAt) > new Date(existing.createdAt)) {
        statementsByAccount.set(s.accountId, s)
      }
    }
  })

  // Search by name, then separate credit cards from bank accounts and sort each section
  const searchTerm = search.trim().toLowerCase()
  const matchingAccounts = (accounts ?? []).filter((a) => {
    if (!searchTerm) return true
    const institutionName = a.institution ? institutions[a.institution] : undefined
    return [a.accountName, a.productName, a.institution, institutionName].some((value) =>
      value?.toLowerCase().includes(searchTerm)
    )
  })
  const creditCards = sortAccounts(
    matchingAccounts.filter((a) => a.type === 'credit_card'),
    sort
  )
  const bankAccounts = sortAccounts(
    matchingAccounts.filter((a) => a.type !== 'credit_card'),
    sort
  )

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <PageHeader
        title="Accounts"
        description="Manage your financial accounts"
        actions={
          <div className="flex items-center gap-3">
            <Button asChild>
              <Link to="/statements" search={{ upload: true }}>
                <Upload className="h-4 w-4 mr-1.5" />
                Upload Statement
              </Link>
            </Button>
            <ProfileSelector
              selectedProfileId={selectorProfileId}
              onProfileChange={handleProfileChange}
              showFamilyView={showFamilyView}
              onFamilyViewChange={handleFamilyViewChange}
            />
          </div>
        }
      />

      {/* Edit Form */}
      {editingAccount && (
        <AccountForm
          account={editingAccount}
          profileId={activeProfileId!}
          accountTypes={accountTypes || []}
          onClose={() => {
            setEditingAccount(null)
          }}
          onSuccess={() => {
            setEditingAccount(null)
            queryClient.invalidateQueries({ queryKey: ['accounts'] })
          }}
        />
      )}

      {/* Accounts Display */}
      {accounts && accounts.length > 0 && (
        <SearchSortBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search accounts..."
          sort={sort}
          sortOptions={ACCOUNT_SORT_OPTIONS}
          onSortChange={setSort}
        />
      )}

      {isError ? (
        <QueryError error={error} onRetry={refetch} />
      ) : accountsLoading ? (
        <div className="space-y-8">
          <section>
            <div className="h-7 w-32 bg-surface-elevated rounded animate-pulse mb-4" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          </section>
        </div>
      ) : accounts && accounts.length > 0 && matchingAccounts.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching accounts"
          description="Try adjusting your search."
        />
      ) : accounts && accounts.length > 0 ? (
        <div className="space-y-8">
          {/* Credit Cards Section */}
          {creditCards.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-violet-500" />
                Credit Cards
              </h2>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {creditCards.map((account) => (
                  <CreditCardDisplay
                    key={account.id}
                    account={account}
                    countryCode={countryCode}
                    institutionName={
                      account.institution ? institutions[account.institution] : undefined
                    }
                    onEdit={() => setEditingAccount(account)}
                    onDelete={() => deleteMutation.mutate(account.id)}
                    onRecategorize={() => setRecategorizeAccount(account)}
                    onSelect={() => setSelectedCreditCard(account)}
                    profiles={profiles}
                    showProfileBadge={showFamilyView}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Bank Accounts Section */}
          {bankAccounts.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-emerald-500" />
                Bank Accounts
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {bankAccounts.map((account) => (
                  <BankAccountCard
                    key={account.id}
                    account={account}
                    accountTypes={accountTypes || []}
                    countryCode={countryCode}
                    institutionName={
                      account.institution ? institutions[account.institution] : undefined
                    }
                    statement={statementsByAccount.get(account.id)}
                    onEdit={() => setEditingAccount(account)}
                    onDelete={() => deleteMutation.mutate(account.id)}
                    onRecategorize={() => setRecategorizeAccount(account)}
                    profiles={profiles}
                    showProfileBadge={showFamilyView}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <EmptyState
          icon={Upload}
          title="No accounts yet"
          description="Upload a bank or credit card statement to automatically add your accounts and start tracking your finances."
          action={{
            label: 'Upload Statement',
            href: '/statements?upload=true',
            icon: Upload,
          }}
        />
      )}

      {/* Recategorize Modal */}
      {activeProfileId && recategorizeAccount && (
        <RecategorizeModal
          open={!!recategorizeAccount}
          onOpenChange={(open) => !open && setRecategorizeAccount(null)}
          profileId={activeProfileId}
          accountId={recategorizeAccount.id}
          targetName={
            recategorizeAccount.accountName || recategorizeAccount.institution || 'Account'
          }
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['transactions'] })
          }}
        />
      )}

      {/* Credit Card Detail Modal */}
      <CreditCardDetailModal
        account={selectedCreditCard}
        onOpenChange={(open) => !open && setSelectedCreditCard(null)}
        countryCode={countryCode}
        institutionName={
          selectedCreditCard?.institution ? institutions[selectedCreditCard.institution] : undefined
        }
        currencySymbol={currencySymbol}
        accounts={accounts}
        institutions={institutions}
      />
    </div>
  )
}
