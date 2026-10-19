import type { MonthlyTrendData } from '@/lib/api'

export function formatFullCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatPercent(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`
}

/** "15 Oct" for the day a partial month runs through */
export function formatThroughDate(throughDate: string): string {
  return new Date(`${throughDate}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

// "Oct 26 (to 15 Oct)" for months cut short by the range, otherwise the plain label
export function describeMonth(m: MonthlyTrendData): string {
  if (!m.isPartial || !m.throughDate) return m.monthLabel
  return `${m.monthLabel} (to ${formatThroughDate(m.throughDate)})`
}
