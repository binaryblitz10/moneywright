import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { CornerUpLeft, ChevronLeft, ChevronRight, PiggyBank, Plus } from 'lucide-react'
import { ProfileSelector } from '@/components/domain/profile-selector'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { QueryError } from '@/components/ui/query-error'
import { CardSkeleton, StatCardGridSkeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { BudgetDialog } from '@/components/budgets/budget-dialog'
import { BudgetCard } from '@/components/budgets/budget-card'
import { BudgetGlance } from '@/components/budgets/budget-glance'
import { getMonthPace, monthTitle, shiftMonth } from '@/components/budgets/format'
import {
  useBudgets,
  useCategories,
  useCreateBudget,
  useDeleteBudget,
  useProfileSelection,
  useUpdateBudget,
} from '@/hooks'
import type { Budget } from '@/lib/api'

export const Route = createFileRoute('/_app/budgets')({
  component: BudgetsPage,
})

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function BudgetsPage() {
  const {
    activeProfileId,
    showFamilyView,
    selectorProfileId,
    handleProfileChange,
    handleFamilyViewChange,
  } = useProfileSelection()

  const [month, setMonth] = useState(currentMonth)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)
  const [deleting, setDeleting] = useState<Budget | null>(null)

  const { data, isLoading, isError, error, refetch } = useBudgets(activeProfileId, month)
  const { data: categoryData } = useCategories()
  const createMutation = useCreateBudget(activeProfileId)
  const updateMutation = useUpdateBudget()
  const deleteMutation = useDeleteBudget()

  // Closest to (or past) the limit first
  const budgets = [...(data?.budgets ?? [])].sort((a, b) => b.percentUsed - a.percentUsed)
  const currency = data?.currency ?? 'INR'
  const isCurrentMonth = month === currentMonth()
  const pace = getMonthPace(month)
  const colorOf = (code: string) =>
    categoryData?.categories.find((c) => c.code === code)?.color ?? 'zinc'

  // Only spending categories without a budget can be added
  const budgeted = new Set(budgets.map((b) => b.category))
  const availableCategories = (categoryData?.categories ?? []).filter(
    (c) => c.kind === 'expense' && !budgeted.has(c.code)
  )

  return (
    <>
      <div className="space-y-8">
        <PageHeader
          title="Budgets"
          description="Set a monthly limit for each spending category"
          actions={
            <div className="flex items-center gap-3">
              {!showFamilyView && (
                <>
                  <div className="inline-flex items-center gap-1 rounded-xl border border-border-subtle bg-card p-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Previous month"
                      onClick={() => setMonth(shiftMonth(month, -1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="min-w-44 text-center text-sm font-medium">
                      <span className="relative inline-block">
                        {monthTitle(month)}
                        {!isCurrentMonth && (
                          <button
                            type="button"
                            aria-label="Back to this month"
                            title="Back to this month"
                            className="absolute left-full top-1/2 ml-2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-primary transition-colors hover:bg-muted"
                            onClick={() => setMonth(currentMonth())}
                          >
                            <CornerUpLeft className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Next month"
                      disabled={isCurrentMonth}
                      onClick={() => setMonth(shiftMonth(month, 1))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
              <Button
                onClick={() => setAddOpen(true)}
                disabled={showFamilyView || availableCategories.length === 0}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add budget
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

        {showFamilyView ? (
          <EmptyState
            icon={PiggyBank}
            title="Pick a profile"
            description="Budgets belong to one profile. Switch to a profile to see or set its budgets."
          />
        ) : (
          <>
            {isLoading ? (
              <div className="space-y-4">
                <StatCardGridSkeleton />
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <CardSkeleton key={i} />
                  ))}
                </div>
              </div>
            ) : isError ? (
              <QueryError error={error} onRetry={() => refetch()} />
            ) : data && budgets.length === 0 ? (
              <EmptyState
                icon={PiggyBank}
                title="No budgets yet"
                description="Add a monthly limit for a category like Food or Shopping and watch it fill up as you spend."
                action={{ label: 'Add budget', onClick: () => setAddOpen(true), icon: Plus }}
              />
            ) : (
              data && (
                <div className="space-y-6">
                  <BudgetGlance summary={data} pace={pace} month={month} />
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {budgets.map((budget) => (
                      <BudgetCard
                        key={budget.id}
                        budget={budget}
                        color={colorOf(budget.category)}
                        currency={currency}
                        month={month}
                        pace={pace}
                        onEdit={() => setEditing(budget)}
                        onDelete={() => setDeleting(budget)}
                      />
                    ))}
                    {availableCategories.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setAddOpen(true)}
                        className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-hover text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
                      >
                        <Plus className="h-5 w-5" />
                        Add another budget
                      </button>
                    )}
                  </div>
                </div>
              )
            )}
          </>
        )}
      </div>

      {addOpen && (
        <BudgetDialog
          open
          onOpenChange={setAddOpen}
          categories={availableCategories}
          isSaving={createMutation.isPending}
          onSave={(values) => createMutation.mutate(values, { onSuccess: () => setAddOpen(false) })}
        />
      )}

      {editing && (
        <BudgetDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          budget={editing}
          categories={[]}
          isSaving={updateMutation.isPending}
          onSave={({ monthlyAmount, rollover }) =>
            updateMutation.mutate(
              { id: editing.id, data: { monthlyAmount, rollover } },
              { onSuccess: () => setEditing(null) }
            )
          }
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this budget?</AlertDialogTitle>
            <AlertDialogDescription>
              The {deleting?.categoryLabel} budget will be removed. Your transactions are not
              affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleting &&
                deleteMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
              }
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
