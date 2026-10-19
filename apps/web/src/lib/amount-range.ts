/**
 * Amount filter for transaction rules: the edited form and the inclusive limits sent to the API
 */

export type AmountMode = 'any' | 'above' | 'below' | 'between'

/** Amount filter as edited: the inputs are kept as text so partial values can be typed */
export interface AmountRangeValue {
  mode: AmountMode
  min: string
  max: string
}

/** Inclusive amount limits sent to the API; null = no limit */
export interface AmountLimits {
  minAmount: number | null
  maxAmount: number | null
}

export const ANY_AMOUNT: AmountRangeValue = { mode: 'any', min: '', max: '' }

function parseAmount(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, '')
  if (!trimmed) return null
  const amount = Number(trimmed)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

/**
 * Build the edited value from a rule's stored limits
 */
export function amountRangeFromLimits(
  minAmount: number | null,
  maxAmount: number | null
): AmountRangeValue {
  const mode: AmountMode =
    minAmount !== null && maxAmount !== null
      ? 'between'
      : minAmount !== null
        ? 'above'
        : maxAmount !== null
          ? 'below'
          : 'any'
  return { mode, min: minAmount?.toString() ?? '', max: maxAmount?.toString() ?? '' }
}

/**
 * The limits for an edited value, or null while it is incomplete or invalid
 */
export function toAmountLimits(value: AmountRangeValue): AmountLimits | null {
  const min = parseAmount(value.min)
  const max = parseAmount(value.max)
  switch (value.mode) {
    case 'any':
      return { minAmount: null, maxAmount: null }
    case 'above':
      return min === null ? null : { minAmount: min, maxAmount: null }
    case 'below':
      return max === null ? null : { minAmount: null, maxAmount: max }
    case 'between':
      return min === null || max === null || min > max ? null : { minAmount: min, maxAmount: max }
  }
}

function formatAmount(amount: number): string {
  return amount.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

/**
 * Short description of a rule's amount limits, or null when it has none
 */
export function describeAmountLimits(
  minAmount: number | null,
  maxAmount: number | null
): string | null {
  if (minAmount !== null && maxAmount !== null) {
    return `${formatAmount(minAmount)} – ${formatAmount(maxAmount)}`
  }
  if (minAmount !== null) return `Above ${formatAmount(minAmount)}`
  if (maxAmount !== null) return `Below ${formatAmount(maxAmount)}`
  return null
}
