function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Suggest a "description contains" term for a transaction.
 * Prefers the transaction's saved name when its words appear in the description in order,
 * otherwise falls back to the leading words of the description that contain no digits.
 */
export function suggestTerm(originalDescription: string, previousName: string | null): string {
  const nameWords = (previousName ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  if (nameWords.length > 0) {
    const pattern = new RegExp(`(?<![a-z0-9])${nameWords.map(escapeRegExp).join('[^a-z0-9]+')}`)
    if (pattern.test(originalDescription.toLowerCase())) return nameWords.join(' ')
  }

  return originalDescription
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !/\d/.test(word))
    .slice(0, 4)
    .join(' ')
}
