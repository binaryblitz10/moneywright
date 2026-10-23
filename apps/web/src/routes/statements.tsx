import { useState, useEffect } from 'react'
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/components/domain/app-layout'
import { ProfileSelector } from '@/components/domain/profile-selector'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Upload } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAuth,
  useStatements,
  useAccounts,
  useInvestmentSources,
  useConstants,
  useDeleteStatement,
  useProfileSelection,
} from '@/hooks'
import {
  StatementCard,
  StatementEditDialog,
  FilterBar,
  StatementGroup,
  UploadForm,
  type StatementGroupKind,
  type SortOption,
} from '@/components/statements'
import { RecategorizeModal } from '@/components/transactions/recategorize-modal'
import { EmptyState } from '@/components/ui/empty-state'
import { FileText, Upload as UploadIcon } from 'lucide-react'
import type { Statement } from '@/lib/api'
import { isStatementOverdue } from '@/lib/statement-overdue'

// Search params validation
type StatementsSearchParams = {
  upload?: boolean
  /** Comma-separated statement IDs to show (e.g. from a Data Health issue) */
  ids?: string
  /** Account to filter by on arrival */
  accountId?: string
}

export const Route = createFileRoute('/statements')({
  component: StatementsPage,
  validateSearch: (search: Record<string, unknown>): StatementsSearchParams => {
    return {
      upload: search.upload === true || search.upload === 'true' ? true : undefined,
      ids: typeof search.ids === 'string' && search.ids ? search.ids : undefined,
      accountId:
        typeof search.accountId === 'string' && search.accountId ? search.accountId : undefined,
    }
  },
})

const SORT_STORAGE_KEY = 'statements_sort_order'
const GROUP_KIND_ORDER: Record<StatementGroupKind, number> = {
  credit_card: 0,
  bank: 1,
  investment: 2,
}

const GROUP_KIND_LABELS: Record<StatementGroupKind, string> = {
  credit_card: 'Credit Cards',
  bank: 'Bank Accounts',
  investment: 'Investments',
}

function StatementsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const searchParams = useSearch({ from: '/statements' })
  const { profiles } = useAuth()
  const {
    activeProfileId,
    showFamilyView,
    selectorProfileId,
    handleProfileChange,
    handleFamilyViewChange,
  } = useProfileSelection()
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [accountFilter, setAccountFilter] = useState<string | null>(searchParams.accountId ?? null)
  const idFilter = searchParams.ids ? new Set(searchParams.ids.split(',')) : null
  const [sortOrder, setSortOrder] = useState<SortOption>(() => {
    const saved = localStorage.getItem(SORT_STORAGE_KEY)
    return (saved as SortOption) || 'period_desc'
  })
  const [editStatement, setEditStatement] = useState<Statement | null>(null)
  const [recategorizeStatement, setRecategorizeStatement] = useState<Statement | null>(null)

  // Open upload dialog if ?upload=true is in the URL
  useEffect(() => {
    if (searchParams.upload) {
      // Use setTimeout to avoid sync setState in effect
      const timer = setTimeout(() => {
        setShowUploadDialog(true)
        // Clear the search param without navigating
        navigate({ to: '/statements', search: {}, replace: true })
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [searchParams.upload, navigate])

  const handleSortChange = (value: SortOption) => {
    setSortOrder(value)
    localStorage.setItem(SORT_STORAGE_KEY, value)
  }

  // Query enabled when we have a profileId OR we're in family view
  const queryEnabled = !!activeProfileId || showFamilyView

  // Query hooks
  const { data: statements, isLoading: statementsLoading } = useStatements(activeProfileId, {
    enabled: queryEnabled,
    refetchInterval: (query) => {
      // Poll for updates when any statement is pending or parsing
      const data = (query as { state: { data?: { status: string }[] } }).state.data
      if (data?.some((s) => s.status === 'pending' || s.status === 'parsing')) {
        return 3000
      }
      return false
    },
  })
  const { data: accounts } = useAccounts(activeProfileId, { enabled: queryEnabled })
  const { data: investmentSources } = useInvestmentSources(activeProfileId, {
    enabled: queryEnabled,
  })
  const { rawInvestmentSourceTypes, rawInstitutions } = useConstants()

  // Mutation hooks
  const deleteMutation = useDeleteStatement(activeProfileId)

  // Create lookup maps
  const accountMap = new Map(accounts?.map((a) => [a.id, a]) || [])
  const sourceMap = new Map(investmentSources?.map((s) => [s.id, s]) || [])
  const sourceTypeMap = new Map(rawInvestmentSourceTypes.map((st) => [st.code, st]))
  const institutionMap = new Map(rawInstitutions.map((inst) => [inst.id, inst]))

  // Filter and sort statements
  const filteredAndSortedStatements = (() => {
    const result = statements?.filter(
      (s) => (!accountFilter || s.accountId === accountFilter) && (!idFilter || idFilter.has(s.id))
    )

    if (!result) return result

    return [...result].sort((a, b) => {
      switch (sortOrder) {
        case 'period_desc': {
          const dateA = a.periodEnd || a.periodStart || a.createdAt
          const dateB = b.periodEnd || b.periodStart || b.createdAt
          return new Date(dateB).getTime() - new Date(dateA).getTime()
        }
        case 'period_asc': {
          const dateA = a.periodStart || a.periodEnd || a.createdAt
          const dateB = b.periodStart || b.periodEnd || b.createdAt
          return new Date(dateA).getTime() - new Date(dateB).getTime()
        }
        case 'upload_desc':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case 'upload_asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        default:
          return 0
      }
    })
  })()

  // For investment statements use the source type logo, otherwise the institution logo
  const getLogoPath = (statement: Statement): string | null => {
    const account = statement.accountId ? accountMap.get(statement.accountId) : undefined
    const source = statement.sourceId ? sourceMap.get(statement.sourceId) : undefined
    if (statement.documentType === 'investment_statement') {
      return (source?.sourceType && sourceTypeMap.get(source.sourceType)?.logo) || null
    }
    return (account?.institution && institutionMap.get(account.institution)?.logo) || null
  }

  // Group by account or investment source, ordered like the Accounts page: credit cards,
  // then bank accounts, then investments, each in the order the accounts are listed.
  const statementGroups = (() => {
    const groups = new Map<
      string,
      {
        sortKey: number
        overdueSince: string | null
        title: string
        subtitle: string
        kind: StatementGroupKind
        logoPath: string | null
        balance: number | null
        currency: string
        statements: Statement[]
      }
    >()
    for (const statement of filteredAndSortedStatements ?? []) {
      const account = statement.accountId ? accountMap.get(statement.accountId) : undefined
      const source = statement.sourceId ? sourceMap.get(statement.sourceId) : undefined
      const isInvestment = statement.documentType === 'investment_statement'
      const key = isInvestment
        ? `source:${statement.sourceId ?? 'none'}`
        : `account:${statement.accountId ?? 'none'}`
      let group = groups.get(key)
      if (!group) {
        const kind: StatementGroupKind = isInvestment
          ? 'investment'
          : account?.type === 'credit_card'
            ? 'credit_card'
            : 'bank'
        const last4 = isInvestment
          ? source?.accountIdentifier?.slice(-4)
          : account?.accountNumber?.slice(-4)
        const listIndex = isInvestment
          ? (investmentSources?.findIndex((s) => s.id === statement.sourceId) ?? -1)
          : (accounts?.findIndex((a) => a.id === statement.accountId) ?? -1)
        group = {
          overdueSince:
            !isInvestment && isStatementOverdue(account) ? account!.latestStatementDate : null,
          sortKey: GROUP_KIND_ORDER[kind] * 1000 + (listIndex >= 0 ? listIndex : 999),
          title: isInvestment
            ? source?.sourceName || source?.institution || 'Investment Account'
            : account?.accountName || account?.institution || 'Unknown Account',
          subtitle: last4 ? `••${last4}` : '',
          kind,
          logoPath: getLogoPath(statement),
          balance:
            kind === 'credit_card'
              ? (account?.statementBalance ?? account?.latestBalance ?? null)
              : (account?.latestBalance ?? null),
          currency: account?.currency ?? 'INR',
          statements: [],
        }
        groups.set(key, group)
      }
      group.statements.push(statement)
    }
    return [...groups.entries()].sort(([, a], [, b]) => a.sortKey - b.sortKey)
  })()

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatPeriod = (start: string | null, end: string | null) => {
    if (!start && !end) return null
    const formatFull = (d: string) =>
      new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    if (start && end) return `${formatFull(start)} – ${formatFull(end)}`
    if (end) return formatFull(end)
    return formatFull(start!)
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <PageHeader
          title="Statements"
          description="Upload and manage your financial statements"
          actions={
            <>
              <Button
                onClick={() => setShowUploadDialog(true)}
                disabled={showFamilyView}
                title={showFamilyView ? 'Select a profile to upload statements' : undefined}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload Statement
              </Button>
              <ProfileSelector
                selectedProfileId={selectorProfileId}
                onProfileChange={handleProfileChange}
                showFamilyView={showFamilyView}
                onFamilyViewChange={handleFamilyViewChange}
              />
            </>
          }
        />

        {/* Filter & Sort Bar */}
        {accounts && (
          <FilterBar
            accounts={accounts}
            accountFilter={accountFilter}
            sortOrder={sortOrder}
            statementsCount={filteredAndSortedStatements?.length || 0}
            onAccountFilterChange={setAccountFilter}
            onSortChange={handleSortChange}
          />
        )}

        {idFilter && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-muted/40 px-4 py-2 text-sm">
            <span className="text-muted-foreground">
              Showing the {idFilter.size === 1 ? 'statement' : 'statements'} behind a Data Health
              issue
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => navigate({ to: '/statements', search: {} })}
            >
              Show all
            </Button>
          </div>
        )}

        {/* Upload Dialog */}
        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogContent
            className="sm:max-w-2xl border-0 p-0 gap-0 overflow-hidden h-150 max-h-[85vh] flex flex-col"
            showCloseButton={false}
          >
            {activeProfileId && (
              <UploadForm
                profileId={activeProfileId}
                onClose={() => setShowUploadDialog(false)}
                onSuccess={() => {
                  setShowUploadDialog(false)
                  queryClient.invalidateQueries({ queryKey: ['statements'] })
                  queryClient.invalidateQueries({ queryKey: ['accounts'] })
                }}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Statements Grid */}
        {statementsLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        ) : filteredAndSortedStatements && filteredAndSortedStatements.length > 0 ? (
          <div className="space-y-8">
            {(Object.keys(GROUP_KIND_LABELS) as StatementGroupKind[]).map((kind) => {
              const kindGroups = statementGroups.filter(([, group]) => group.kind === kind)
              if (kindGroups.length === 0) return null
              return (
                <section key={kind} className="space-y-3">
                  <h2 className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {GROUP_KIND_LABELS[kind]}
                    <span className="ml-2 font-normal normal-case tracking-normal">
                      {kindGroups.length}
                    </span>
                  </h2>
                  <div className="space-y-4">
                    {kindGroups.map(([key, group]) => (
                      <StatementGroup
                        key={key}
                        title={group.title}
                        subtitle={group.subtitle}
                        logoPath={group.logoPath}
                        kind={group.kind}
                        statements={group.statements}
                        balance={group.balance}
                        currency={group.currency}
                        overdueSince={group.overdueSince}
                        onMissingClick={() => setShowUploadDialog(true)}
                      >
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {group.statements.map((statement) => (
                            <StatementCard
                              key={statement.id}
                              statement={statement}
                              account={
                                statement.accountId
                                  ? accountMap.get(statement.accountId)
                                  : undefined
                              }
                              source={
                                statement.sourceId ? sourceMap.get(statement.sourceId) : undefined
                              }
                              logoPath={group.logoPath}
                              formatFileSize={formatFileSize}
                              formatPeriod={formatPeriod}
                              onDelete={() => deleteMutation.mutate(statement.id)}
                              onEdit={() => setEditStatement(statement)}
                              onRecategorize={() => setRecategorizeStatement(statement)}
                              profiles={profiles}
                              showProfileBadge={showFamilyView}
                            />
                          ))}
                        </div>
                      </StatementGroup>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon={accountFilter ? FileText : UploadIcon}
            title={accountFilter ? 'No statements for this account' : 'No statements yet'}
            description={
              accountFilter
                ? 'Upload a statement for this account or clear the filter to see all statements.'
                : 'Upload a bank, credit card, or investment statement to start tracking your finances.'
            }
            action={{
              label: 'Upload Statement',
              onClick: () => setShowUploadDialog(true),
              icon: UploadIcon,
            }}
          />
        )}

        {/* Edit Statement Dialog */}
        {editStatement && (
          <StatementEditDialog
            statement={editStatement}
            isCreditCard={
              !!editStatement.accountId &&
              accountMap.get(editStatement.accountId)?.type === 'credit_card'
            }
            onClose={() => setEditStatement(null)}
          />
        )}

        {/* Recategorize Modal */}
        {activeProfileId && recategorizeStatement && (
          <RecategorizeModal
            open={!!recategorizeStatement}
            onOpenChange={(open) => !open && setRecategorizeStatement(null)}
            profileId={activeProfileId}
            statementId={recategorizeStatement.id}
            hintsAccountId={recategorizeStatement.accountId ?? undefined}
            targetName={recategorizeStatement.originalFilename || 'Statement'}
            _targetType="statement"
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['transactions'] })
            }}
          />
        )}
      </div>
    </AppLayout>
  )
}
