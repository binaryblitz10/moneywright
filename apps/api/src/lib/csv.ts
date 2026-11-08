/** Quote a CSV field when needed; also defuses spreadsheet formulas (=, +, -, @) in text */
export function csvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(
  header: string[],
  rows: (string | number | boolean | null | undefined)[][]
): string {
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n'
}
