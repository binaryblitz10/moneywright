/**
 * Dashboard widgets that can be switched off in Settings.
 * The preference stores the hidden ids, so widgets added later are shown by default.
 */

export const DASHBOARD_WIDGETS = [
  { id: 'net_worth', label: 'Net worth', group: 'cards' },
  { id: 'income', label: 'Income', group: 'cards' },
  { id: 'expenses', label: 'Expenses', group: 'cards' },
  { id: 'savings_rate', label: 'Savings rate', group: 'cards' },
  { id: 'investments', label: 'Investments', group: 'cards' },
  { id: 'income_vs_expenses', label: 'Income vs expenses chart', group: 'sections' },
  { id: 'spending_by_category', label: 'Spending by category', group: 'sections' },
  { id: 'income_by_category', label: 'Income by category', group: 'sections' },
  { id: 'what_changed', label: 'What changed', group: 'sections' },
  { id: 'subscriptions', label: 'Subscriptions', group: 'sections' },
  { id: 'account_balances', label: 'Account balances', group: 'sections' },
] as const

export type DashboardWidgetId = (typeof DASHBOARD_WIDGETS)[number]['id']

export const DASHBOARD_WIDGET_GROUPS = [
  { id: 'cards', label: 'Summary cards' },
  { id: 'sections', label: 'Sections' },
] as const

const WIDGET_IDS = new Set<string>(DASHBOARD_WIDGETS.map((w) => w.id))

/** Parse the saved hidden-widgets preference (a JSON array of ids), ignoring unknown ids */
export function parseHiddenWidgets(value: string | undefined): DashboardWidgetId[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((id): id is DashboardWidgetId => typeof id === 'string' && WIDGET_IDS.has(id))
      : []
  } catch {
    return []
  }
}
