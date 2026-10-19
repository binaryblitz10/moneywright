export interface TransactionMoneyValues {
  date: string
  /** Kept as typed so partial input like "12." isn't rewritten */
  amount: string
  type: 'credit' | 'debit'
}

/** The parsed amount, or null unless it is positive with at most 2 decimals */
export function parseAmount(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$|^\.\d{1,2}$/.test(value.trim())) return null
  const amount = Number(value)
  return amount > 0 ? amount : null
}

export function isValidDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  )
}

export function areMoneyValuesValid(values: TransactionMoneyValues): boolean {
  return isValidDate(values.date) && parseAmount(values.amount) !== null
}
