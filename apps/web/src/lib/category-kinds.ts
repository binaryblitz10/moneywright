import type { Category, CategoryKind } from './api'

/** Display order of category kinds */
export const CATEGORY_KIND_ORDER: CategoryKind[] = ['income', 'expense', 'investment', 'transfer']

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  income: 'Income',
  expense: 'Expense',
  investment: 'Investment',
  transfer: 'Transfer',
}

/** Kind of a category code; unknown codes count as expenses (matches the API) */
export function getKindOf(categories: Category[], code: string): CategoryKind {
  return categories.find((category) => category.code === code)?.kind ?? 'expense'
}

/** Categories of one kind, in list order */
export function categoriesOfKind(categories: Category[], kind: CategoryKind): Category[] {
  return categories.filter((category) => category.kind === kind)
}
