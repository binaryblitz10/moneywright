/**
 * Pure decision helpers for recovering statements whose processing was
 * interrupted by an app restart. No database or app state access.
 */

export const INTERRUPTED_STATEMENT_MESSAGE =
  'Interrupted — the app was closed while this statement was being processed. Please upload it again.'

/** Prefix of the placeholder account created while a statement is being parsed */
export const PLACEHOLDER_ACCOUNT_PREFIX = 'Pending - '

/** Document types whose transactions go through categorization */
const CATEGORIZABLE_DOCUMENT_TYPES = ['bank_statement', 'credit_card_statement']

/** A statement is interrupted when it is still queued or mid-parse at startup */
export function isInterruptedStatus(status: string): boolean {
  return status === 'pending' || status === 'parsing'
}

export function isPlaceholderAccountName(name: string | null): boolean {
  return !!name && name.startsWith(PLACEHOLDER_ACCOUNT_PREFIX)
}

export function isCategorizableDocumentType(documentType: string): boolean {
  return CATEGORIZABLE_DOCUMENT_TYPES.includes(documentType)
}

/**
 * Pick the placeholder accounts that are truly orphaned: placeholder name,
 * no statement referencing them and no transactions.
 */
export function findOrphanPlaceholderAccountIds(
  accounts: Array<{ id: string; name: string | null }>,
  referencedByStatements: Set<string>,
  referencedByTransactions: Set<string>
): string[] {
  return accounts
    .filter(
      (a) =>
        isPlaceholderAccountName(a.name) &&
        !referencedByStatements.has(a.id) &&
        !referencedByTransactions.has(a.id)
    )
    .map((a) => a.id)
}

export interface UncategorizedStatementRef {
  accountId: string
  userId: string
  profileId: string
  statementId: string
}

export interface UncategorizedAccountGroup {
  accountId: string
  userId: string
  profileId: string
  statementIds: string[]
}

/** Group statements with uncategorized transactions by account (one LLM run per account) */
export function groupByAccount(refs: UncategorizedStatementRef[]): UncategorizedAccountGroup[] {
  const groups = new Map<string, UncategorizedAccountGroup>()
  for (const ref of refs) {
    const group = groups.get(ref.accountId)
    if (group) {
      if (!group.statementIds.includes(ref.statementId)) group.statementIds.push(ref.statementId)
    } else {
      groups.set(ref.accountId, {
        accountId: ref.accountId,
        userId: ref.userId,
        profileId: ref.profileId,
        statementIds: [ref.statementId],
      })
    }
  }
  return [...groups.values()]
}
