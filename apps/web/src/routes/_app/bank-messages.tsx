/**
 * Bank Messages page - sync card alerts from the Messages app and see every message that was read
 */

import { createFileRoute, Link } from '@tanstack/react-router'
import { Loader2, MessageSquareText, RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { QueryError } from '@/components/ui/query-error'
import { MessagesTable } from '@/components/bank-messages/messages-table'
import { Button } from '@/components/ui/button'
import {
  useAccounts,
  useAuth,
  useCategories,
  usePendingSms,
  useSmsImportStatus,
  useSyncSmsImport,
  useSyncedSms,
} from '@/hooks'

export const Route = createFileRoute('/_app/bank-messages')({
  component: BankMessagesPage,
})

function BankMessagesPage() {
  const {
    data: status,
    isLoading: statusLoading,
    isError: statusError,
    error: statusErrorValue,
    refetch: refetchStatus,
  } = useSmsImportStatus()
  const enabled = !!status?.enabled
  const { data: pending = [] } = usePendingSms(enabled)
  const {
    data: messages,
    isLoading: messagesLoading,
    isError: messagesError,
    error: messagesErrorValue,
    refetch: refetchMessages,
  } = useSyncedSms(enabled)
  const { data: accounts = [] } = useAccounts()
  const syncMutation = useSyncSmsImport()
  const { user } = useAuth()
  const { data: categoriesData } = useCategories()
  const categories = categoriesData?.categories || []

  const formatAmount = (amount: number, curr: string) =>
    new Intl.NumberFormat(curr === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency: curr,
      maximumFractionDigits: 2,
    }).format(amount)

  const getCategoryLabel = (code: string) =>
    categories.find((c) => c.code === code)?.label || code.replace(/_/g, ' ')

  return (
    <>
      <PageHeader
        title="Bank Messages"
        description="Card and bank alerts read from your Messages app"
        actions={
          <div className="flex flex-wrap gap-2">
            {enabled && (
              <Button
                className="px-5 has-[>svg]:px-5"
                disabled={syncMutation.isPending || status?.access !== 'ok'}
                title={
                  status?.access !== 'ok'
                    ? 'Allow Moneywright to read Messages in Settings'
                    : undefined
                }
                onClick={() => syncMutation.mutate(undefined)}
              >
                {syncMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Sync
              </Button>
            )}
          </div>
        }
      />

      {statusError ? (
        <QueryError error={statusErrorValue} onRetry={() => void refetchStatus()} />
      ) : statusLoading ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : !status?.enabled ? (
        <EmptyState
          icon={MessageSquareText}
          title="Bank messages are off"
          description="Turn on Read bank messages in Settings to import card alerts from your Messages app."
          action={{ label: 'Open settings', href: '/settings' }}
        />
      ) : (
        <div className="space-y-4">
          {status.access !== 'ok' && (
            <p className="text-sm text-muted-foreground">
              Moneywright can&apos;t read Messages yet. Finish the setup in{' '}
              <Link to="/settings" className="text-primary hover:underline">
                Settings
              </Link>
              .
            </p>
          )}

          {messagesError ? (
            <QueryError error={messagesErrorValue} onRetry={() => void refetchMessages()} />
          ) : messagesLoading || !messages ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : (
            <MessagesTable
              messages={messages}
              pending={pending}
              accounts={accounts}
              categories={categories}
              countryCode={user?.country?.toLowerCase() || 'in'}
              getCategoryLabel={getCategoryLabel}
              formatAmount={formatAmount}
              lastSyncAt={status.lastSyncAt}
            />
          )}
        </div>
      )}
    </>
  )
}
