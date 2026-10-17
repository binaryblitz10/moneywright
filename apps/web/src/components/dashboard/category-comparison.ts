/**
 * Previous-period spending for the "vs previous period" labels on category widgets
 */

/** Previous-period spending, as returned with the dashboard summary */
export interface PreviousPeriodSpending {
  startDate: string
  endDate: string
  totalExpenses: number
  categoryBreakdown: { category: string; total: number }[]
}

/** Previous-period totals used by the labels; null when there is no full data to compare */
export interface CategoryComparison {
  previousByCategory: Map<string, number>
  previousTotal: number
  /** e.g. "Sep 2026" or "Apr 2025 - Mar 2026" */
  periodLabel: string
}

function formatMonth(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
  })
}

/** Build the comparison from the summary's previous period (null stays null) */
export function toCategoryComparison(
  previous: PreviousPeriodSpending | null
): CategoryComparison | null {
  if (!previous) return null
  const start = formatMonth(previous.startDate)
  const end = formatMonth(previous.endDate)
  return {
    previousByCategory: new Map(previous.categoryBreakdown.map((c) => [c.category, c.total])),
    previousTotal: previous.totalExpenses,
    periodLabel: start === end ? start : `${start} - ${end}`,
  }
}
