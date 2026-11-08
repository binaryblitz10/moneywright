/**
 * Apply/Cancel card for changes proposed by Ask Penny
 */

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { toast } from 'sonner'
import { ArrowRight, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AccountAvatar } from '@/components/transactions/transaction-table'
import { getAccountShortLabel } from '@/lib/statement-display'
import { CategoryIcon } from '@/components/ui/category-icon'
import { formatDate } from '@/components/dashboard/utils'
import { getCategoryColorClasses } from '@/lib/category-colors'
import { cn, plural } from '@/lib/utils'
import {
  bulkUpdateTransactions,
  createBudget,
  createTransactionRule,
  updateBudget,
  type TransactionRuleInput,
} from '@/lib/api'
import { useAuth, useAccounts, useProfileSelection } from '@/hooks'
import { transactionKeys, useCategories } from '@/hooks/useTransactions'
import { transactionRuleKeys } from '@/hooks/useTransactionRules'
import { budgetKeys } from '@/hooks/useBudgets'

interface RecategorizePayload {
  transactionIds: string[]
  category: string
}

interface SetBudgetPayload {
  profileId: string
  category: string
  monthlyAmount: number
  rollover?: boolean
  existingBudgetId?: string
}

interface ProposalBase {
  proposal: true
  title: string
  summary: string
  preview?: {
    count: number
    samples: Array<{
      date: string
      type: 'credit' | 'debit'
      amount: number
      accountId?: string
      currency?: string
      description: string
      originalDescription: string
      category: string
    }>
  }
}

export type Proposal =
  | (ProposalBase & { kind: 'recategorize'; payload: RecategorizePayload })
  | (ProposalBase & { kind: 'createRule'; payload: TransactionRuleInput })
  | (ProposalBase & { kind: 'setBudget'; payload: SetBudgetPayload })

type Resolution = 'applied' | 'cancelled'

const storageKey = (toolCallId: string): string => `penny-proposal:${toolCallId}`

function readResolution(toolCallId: string): Resolution | null {
  try {
    const value = localStorage.getItem(storageKey(toolCallId))
    return value === 'applied' || value === 'cancelled' ? value : null
  } catch {
    return null
  }
}

function writeResolution(toolCallId: string, value: Resolution): void {
  try {
    localStorage.setItem(storageKey(toolCallId), value)
  } catch {
    // Storage unavailable: the status only lasts until the page reloads
  }
}

function errorMessage(error: unknown): string {
  return isAxiosError(error) && error.response?.data?.message
    ? error.response.data.message
    : 'Failed to apply the change'
}

interface ProposalCardProps {
  toolCallId: string
  proposal: Proposal
}

export function ProposalCard({ toolCallId, proposal }: ProposalCardProps) {
  const queryClient = useQueryClient()
  const [resolution, setResolution] = useState<Resolution | null>(() => readResolution(toolCallId))

  const resolve = (value: Resolution) => {
    writeResolution(toolCallId, value)
    setResolution(value)
  }

  const apply = useMutation({
    mutationFn: async (): Promise<void> => {
      switch (proposal.kind) {
        case 'recategorize':
          await bulkUpdateTransactions(proposal.payload)
          return
        case 'createRule':
          await createTransactionRule(proposal.payload)
          return
        case 'setBudget': {
          const { profileId, category, monthlyAmount, rollover, existingBudgetId } =
            proposal.payload
          if (existingBudgetId) {
            await updateBudget(existingBudgetId, { monthlyAmount, rollover })
          } else {
            await createBudget(profileId, { category, monthlyAmount, rollover: rollover ?? false })
          }
        }
      }
    },
    onSuccess: () => {
      toast.success('Change applied')
      resolve('applied')
      if (proposal.kind === 'setBudget') {
        queryClient.invalidateQueries({ queryKey: budgetKeys.all })
      } else {
        queryClient.invalidateQueries({ queryKey: transactionKeys.all })
        queryClient.invalidateQueries({ queryKey: transactionRuleKeys.all })
      }
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const { preview } = proposal
  const { data: categoriesData } = useCategories()
  const categories = categoriesData?.categories ?? []
  const { user } = useAuth()
  const { activeProfileId, showFamilyView } = useProfileSelection()
  const { data: accounts } = useAccounts(activeProfileId, {
    enabled: !!activeProfileId || showFamilyView,
  })
  const countryCode = user?.country?.toLowerCase() || 'in'
  const targetCategory = proposal.kind === 'recategorize' ? proposal.payload.category : null

  const categoryChip = (code: string) => {
    const category = categories.find((c) => c.code === code)
    const colors = getCategoryColorClasses(category?.color ?? 'zinc')
    return (
      <span
        className={cn(
          'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium',
          colors.bg,
          colors.text
        )}
      >
        <CategoryIcon code={code} className="h-3.5 w-3.5" />
        {category?.label ?? code.replace(/_/g, ' ')}
      </span>
    )
  }

  const sample = preview?.samples[0]
  const account = accounts?.find((a) => a.id === sample?.accountId)
  const isCredit = sample?.type === 'credit'
  const formatAmount = (amount: number, currency: string) =>
    new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount)

  return (
    <div className="mt-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground">{proposal.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{proposal.summary}</p>
      </div>
      <article className="animate-fade-in flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface-elevated p-5 text-foreground">
        {sample && (
          <>
            <div className="flex items-center gap-3">
              <AccountAvatar
                logoPath={
                  account?.institution
                    ? `/institutions/${countryCode}/${account.institution}.svg`
                    : null
                }
                institutionId={account?.institution || 'other'}
                isCard={account?.type === 'credit_card'}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {account ? getAccountShortLabel(account) : 'Account'}
                </p>
                <p className="text-xs text-muted-foreground">{formatDate(sample.date)}</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-lg font-medium" title={sample.description}>
                  {sample.description}
                </p>
                {sample.originalDescription !== sample.description && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {sample.originalDescription}
                  </p>
                )}
              </div>
              <p
                className={cn(
                  'shrink-0 text-3xl font-semibold tracking-tight tabular-nums',
                  isCredit && 'text-positive'
                )}
              >
                {isCredit ? '+' : '-'}
                {formatAmount(sample.amount, sample.currency ?? 'INR')}
              </p>
            </div>
            {targetCategory ? (
              <div className="flex flex-wrap items-center gap-3">
                {categoryChip(sample.category)}
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                {categoryChip(targetCategory)}
              </div>
            ) : (
              <div className="flex items-center gap-2">{categoryChip(sample.category)}</div>
            )}
            {preview && preview.count > 1 && (
              <p className="text-sm text-muted-foreground">
                and {plural(preview.count - 1, 'more transaction')}
              </p>
            )}
          </>
        )}

        {resolution ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {resolution === 'applied' && <Check className="h-4 w-4 text-positive" />}
            {resolution === 'applied' ? 'Applied' : 'Cancelled'}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={apply.isPending} onClick={() => apply.mutate()}>
              {apply.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Apply
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={apply.isPending}
              onClick={() => resolve('cancelled')}
            >
              Cancel
            </Button>
          </div>
        )}
      </article>
    </div>
  )
}
