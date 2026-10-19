/**
 * Manual entries live on one placeholder statement per account (documentType 'manual').
 * It has no period or balances, so anything that reasons about statement coverage,
 * balances or periods must skip it.
 */
export const MANUAL_DOCUMENT_TYPE = 'manual'

export const MANUAL_STATEMENT_FILENAME = 'Manual entries'

export function isManualStatement(statement: { documentType: string }): boolean {
  return statement.documentType === MANUAL_DOCUMENT_TYPE
}
