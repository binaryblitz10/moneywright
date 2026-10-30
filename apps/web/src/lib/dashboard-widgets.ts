/**
 * Dashboard widgets that can be switched off and reordered in Settings.
 * The hidden preference stores the hidden ids, so widgets added later are shown by default.
 * The order preference stores the widget ids in display order; widgets missing from it
 * (added later) follow in their default position.
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
  { id: 'what_changed', label: 'Spending changes', group: 'sections' },
  { id: 'budgets', label: 'Budgets', group: 'sections' },
  { id: 'subscriptions', label: 'Subscriptions', group: 'sections' },
  { id: 'review', label: 'Review', group: 'sections' },
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

/** Parse the saved widget order (a JSON array of ids) into a complete order of every widget */
export function parseWidgetOrder(value: string | undefined): DashboardWidgetId[] {
  const defaults = DASHBOARD_WIDGETS.map((w) => w.id)
  if (!value) return defaults
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return defaults
    const saved = parsed.filter(
      (id, index): id is DashboardWidgetId =>
        typeof id === 'string' && WIDGET_IDS.has(id) && parsed.indexOf(id) === index
    )
    return [...saved, ...defaults.filter((id) => !saved.includes(id))]
  } catch {
    return defaults
  }
}

/** Move a widget to the position another widget currently holds */
export function moveWidget(
  order: DashboardWidgetId[],
  id: DashboardWidgetId,
  targetId: DashboardWidgetId
): DashboardWidgetId[] {
  const from = order.indexOf(id)
  const to = order.indexOf(targetId)
  if (from === -1 || to === -1 || from === to) return order
  const next = [...order]
  next.splice(from, 1)
  next.splice(to, 0, id)
  return next
}

export type CardWidgetId = Extract<(typeof DASHBOARD_WIDGETS)[number], { group: 'cards' }>['id']
export type SectionWidgetId = Extract<
  (typeof DASHBOARD_WIDGETS)[number],
  { group: 'sections' }
>['id']

export function isCardWidget(id: DashboardWidgetId): id is CardWidgetId {
  return DASHBOARD_WIDGETS.some((w) => w.id === id && w.group === 'cards')
}

/** Sections that take half the dashboard width when two of them sit next to each other */
export const HALF_WIDTH_SECTIONS: ReadonlySet<SectionWidgetId> = new Set([
  'spending_by_category',
  'income_by_category',
  'what_changed',
  'budgets',
  'subscriptions',
  'review',
])

/** Group ordered sections into dashboard rows: neighbouring half-width sections pair up */
export function chunkSectionRows(sections: SectionWidgetId[]): SectionWidgetId[][] {
  const rows: SectionWidgetId[][] = []
  for (const id of sections) {
    const last = rows[rows.length - 1]
    const [lastId] = last ?? []
    if (
      last?.length === 1 &&
      lastId &&
      HALF_WIDTH_SECTIONS.has(id) &&
      HALF_WIDTH_SECTIONS.has(lastId)
    ) {
      last.push(id)
    } else {
      rows.push([id])
    }
  }
  return rows
}
