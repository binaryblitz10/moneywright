/**
 * Axis scaling helpers for the cash flow chart: even tick steps in one unit, with a
 * single outlier month clipped instead of flattening every other month.
 */

export interface AxisScale {
  /** Top of the axis, a whole number of steps */
  max: number
  step: number
  /** 0, step, 2*step ... max */
  ticks: number[]
}

const STEP_MULTIPLIERS = [1, 2, 2.5, 5, 10]

// A month needs at least this many values before any of them is treated as an outlier
const MIN_VALUES_FOR_OUTLIERS = 4
// Values above this multiple of the 75th percentile are clipped
const OUTLIER_FACTOR = 2

function niceStep(rough: number): number {
  if (rough <= 0) return 1
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)))
  const multiplier = STEP_MULTIPLIERS.find((m) => m * magnitude >= rough * (1 - 1e-9)) ?? 10
  return multiplier * magnitude
}

/** Largest value once outliers are set aside */
function largestTypicalValue(values: number[]): number {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return 0
  const largest = sorted[sorted.length - 1]!
  if (sorted.length < MIN_VALUES_FOR_OUTLIERS) return largest
  const limit = sorted[Math.floor(0.75 * (sorted.length - 1))]! * OUTLIER_FACTOR
  return sorted.filter((v) => v <= limit).pop() ?? largest
}

/**
 * Scale for non-negative magnitudes with roughly `intervals` evenly spaced steps.
 * Values above `max` are outliers and should be drawn clipped.
 */
export function niceScale(values: number[], intervals: number): AxisScale {
  const typical = largestTypicalValue(values)
  const step = niceStep(typical / intervals)
  const count = Math.max(1, Math.ceil(typical / step - 1e-9))
  return {
    max: step * count,
    step,
    ticks: Array.from({ length: count + 1 }, (_, i) => step * i),
  }
}

const SCALE_UNITS = [
  { size: 10000000, suffix: 'Cr' },
  { size: 100000, suffix: 'L' },
  { size: 1000, suffix: 'K' },
]

/**
 * Format an axis tick in the one unit that suits the whole axis (₹0, ₹1L, ₹2L ...),
 * so ticks never mix K and L
 */
export function formatScaleTick(value: number, scaleMax: number, currency: string): string {
  const symbol = currency === 'INR' ? '₹' : '$'
  if (value === 0) return `${symbol}0`
  // Switch to a unit once the axis spans at least two of it
  const unit = SCALE_UNITS.find((u) => scaleMax >= u.size * 2) ?? { size: 1, suffix: '' }
  return `${symbol}${+(value / unit.size).toFixed(2)}${unit.suffix}`
}
