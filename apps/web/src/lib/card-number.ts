const MASK = '•'

/**
 * Masked card number for display. Amex numbers are 15 digits grouped 4-6-5 and
 * show the last 5 digits; other cards use 4 groups of 4 and show the last 4.
 */
export function formatMaskedCardNumber(
  institution: string | null | undefined,
  accountNumber: string | null | undefined
): string {
  const digits = (accountNumber ?? '').replace(/\D/g, '')
  if (institution === 'amex') {
    const tail = digits.slice(-5).padStart(5, MASK)
    return `${MASK.repeat(4)} ${MASK.repeat(6)} ${tail}`
  }
  const tail = digits.slice(-4).padStart(4, MASK)
  return `${MASK.repeat(4)} ${MASK.repeat(4)} ${MASK.repeat(4)} ${tail}`
}
