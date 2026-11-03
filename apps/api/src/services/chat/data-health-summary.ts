/**
 * Data health summary for the chat assistant: turns the data health report, duplicate groups and
 * auto-fix preview into a short list of issues, each with a plain summary and the place in the
 * app to fix it. Statement mismatches are pinpointed to the transactions that could explain them.
 * Read-only: nothing here changes data.
 */

import { and, asc, between, eq, inArray, isNull } from 'drizzle-orm'
import { db, tables } from '../../db'
import type { CountryCode } from '../../lib/constants'
import { sourceFromHash } from '../../lib/duplicate-score'
import { logger } from '../../lib/logger'
import { getAccountsByUserId } from '../accounts'
import { previewFixes } from '../auto-fix'
import {
  addDays,
  daysBetween,
  getDataHealth,
  type AccountCoverage,
  type BalanceBreak,
  type StatementOverlap,
} from '../data-health'
import { findDuplicateGroups, type DuplicateGroup } from '../duplicates'
import { findUserById } from '../user'

const MAX_ISSUES = 25
const MAX_ISSUES_DETAILED = 60
const MAX_DUPLICATE_GROUPS = 10
const MAX_SUSPECTS = 5
const NEIGHBOUR_DAYS = 3
const MAX_DESCRIPTION_LENGTH = 80

export type IssueKind =
  | 'gap'
  | 'overlap'
  | 'balance_break'
  | 'statement_mismatch'
  | 'unverifiable_statement'
  | 'stale_account'
  | 'missing_period'
  | 'card_payment'
  | 'low_confidence'
  | 'duplicate_group'

export type TransactionSource = 'statement' | 'bank_message' | 'manual'

export interface TxnCandidate {
  id: string
  date: string
  type: 'credit' | 'debit'
  amount: number
  description: string
  source: TransactionSource
}

export interface SuspectTransaction extends TxnCandidate {
  /** Another source holds the same amount within a few days, so this is probably a copy */
  likelyDuplicate: boolean
}

export interface DuplicateGroupSummary {
  tier: 'sure' | 'likely'
  reasons: string[]
  suggestedKeeperId: string
  transactions: TxnCandidate[]
}

export interface HealthIssue {
  kind: IssueKind
  summary: string
  account?: string
  from?: string
  to?: string
  amount?: number
  howToFix: string
  /** Not a real problem; shown after the real issues */
  likelyFalseAlarm?: true
  falseAlarmReason?: string
  suspectTransactions?: SuspectTransaction[]
  duplicateGroup?: DuplicateGroupSummary
}

export interface DataHealthSummary {
  issueCount: number
  realIssueCount: number
  issues: HealthIssue[]
  omittedIssues: number
  /** Duplicate groups found in total (the issue list shows the top ones) */
  duplicateGroupCount: number
  /** Fixes the Fix issues button would offer, per fixer; null when they could not be checked */
  autoFixable: Array<{ fixer: string; label: string; count: number }> | null
}

export function truncate(text: string, max = MAX_DESCRIPTION_LENGTH): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function toSource(hash: string): TransactionSource {
  const source = sourceFromHash(hash)
  return source === 'sms' ? 'bank_message' : source
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Transactions whose amount equals the statement difference, up to `limit`. A candidate is flagged
 * when another source holds the same amount and type within a few days.
 */
export function findSuspects(
  rows: TxnCandidate[],
  periodStart: string,
  periodEnd: string,
  difference: number,
  limit = MAX_SUSPECTS
): SuspectTransaction[] {
  const target = Math.abs(round2(difference))
  return rows
    .filter((r) => r.date >= periodStart && r.date <= periodEnd && round2(r.amount) === target)
    .slice(0, limit)
    .map((r) => ({
      ...r,
      likelyDuplicate: rows.some(
        (o) =>
          o.id !== r.id &&
          o.type === r.type &&
          o.source !== r.source &&
          round2(o.amount) === target &&
          Math.abs(daysBetween(o.date, r.date)) <= NEIGHBOUR_DAYS
      ),
    }))
}

/** True when the statement after the break opens before the one before it closes */
export function isOverlapBreak(brk: BalanceBreak, overlaps: StatementOverlap[]): boolean {
  return overlaps.some(
    (o) =>
      o.statementIds.includes(brk.previousStatementId) &&
      o.statementIds.includes(brk.nextStatementId)
  )
}

interface AccountTxnRow {
  id: string
  date: string
  type: string
  amount: string | number
  originalDescription: string
  hash: string
}

function toCandidate(row: AccountTxnRow): TxnCandidate {
  return {
    id: row.id,
    date: row.date,
    type: row.type as 'credit' | 'debit',
    amount: Number(row.amount),
    description: truncate(row.originalDescription),
    source: toSource(row.hash),
  }
}

/** The account's live (not merged away) transactions around a period */
async function loadAccountRows(
  userId: string,
  accountId: string,
  from: string,
  to: string
): Promise<TxnCandidate[]> {
  const rows = await db
    .select({
      id: tables.transactions.id,
      date: tables.transactions.date,
      type: tables.transactions.type,
      amount: tables.transactions.amount,
      originalDescription: tables.transactions.originalDescription,
      hash: tables.transactions.hash,
    })
    .from(tables.transactions)
    .where(
      and(
        eq(tables.transactions.userId, userId),
        eq(tables.transactions.accountId, accountId),
        isNull(tables.transactions.duplicateOfId),
        between(
          tables.transactions.date,
          addDays(from, -NEIGHBOUR_DAYS),
          addDays(to, NEIGHBOUR_DAYS)
        )
      )
    )
    .orderBy(asc(tables.transactions.date))
  return rows.map(toCandidate)
}

async function summariseGroups(
  userId: string,
  groups: DuplicateGroup[]
): Promise<DuplicateGroupSummary[]> {
  const ids = groups.flatMap((g) => g.transactions.map((t) => t.id))
  const hashes = new Map<string, string>()
  if (ids.length > 0) {
    const rows = await db
      .select({ id: tables.transactions.id, hash: tables.transactions.hash })
      .from(tables.transactions)
      .where(and(eq(tables.transactions.userId, userId), inArray(tables.transactions.id, ids)))
    for (const row of rows) hashes.set(row.id, row.hash)
  }
  return groups.map((g) => ({
    tier: g.tier,
    reasons: g.reasons,
    suggestedKeeperId: g.suggestedKeeperId,
    transactions: g.transactions.map((t) => ({
      id: t.id,
      date: t.date,
      type: t.type,
      amount: t.amount,
      description: truncate(t.originalDescription),
      source: toSource(hashes.get(t.id) ?? ''),
    })),
  }))
}

interface StatementInfo {
  filename: string
  skippedDuplicateCount: number
}

async function loadSkippedCounts(accounts: AccountCoverage[]): Promise<Map<string, StatementInfo>> {
  const ids = [...new Set(accounts.flatMap((a) => a.overlaps.flatMap((o) => o.statementIds)))]
  const info = new Map<string, StatementInfo>()
  if (ids.length === 0) return info
  const rows = await db
    .select({
      id: tables.statements.id,
      filename: tables.statements.originalFilename,
      summary: tables.statements.summary,
    })
    .from(tables.statements)
    .where(inArray(tables.statements.id, ids))
  for (const row of rows) {
    let parsed: unknown = row.summary
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed)
      } catch {
        parsed = null
      }
    }
    const count = (parsed as { skippedDuplicateCount?: unknown } | null)?.skippedDuplicateCount
    info.set(row.id, {
      filename: row.filename,
      skippedDuplicateCount: typeof count === 'number' ? count : 0,
    })
  }
  return info
}

const REVIEW_DUPLICATES = 'Review → Duplicates tab: merge the copies, keeping the suggested one.'
const STATEMENTS_PAGE = 'Statements page: open the statement and set its period dates.'

export async function buildDataHealthSummary(
  userId: string,
  profileId: string | undefined,
  includeDetails: boolean
): Promise<DataHealthSummary> {
  const [report, groups, accounts, user] = await Promise.all([
    getDataHealth(userId, { profileId }),
    findDuplicateGroups(userId, { profileId }),
    getAccountsByUserId(userId, profileId),
    findUserById(userId),
  ])
  const statementInfo = await loadSkippedCounts(report.accounts)
  const currencyByAccount = new Map(accounts.map((a) => [a.id, a.currency]))
  const groupSummaries = await summariseGroups(userId, groups.slice(0, MAX_DUPLICATE_GROUPS))

  const real: HealthIssue[] = []
  const falseAlarms: HealthIssue[] = []

  for (const acc of report.accounts) {
    const name = acc.accountName
    const currency = currencyByAccount.get(acc.accountId)
    const money = (n: number) => `${currency ?? ''} ${Math.abs(round2(n))}`.trim()

    for (const gap of acc.gaps) {
      real.push({
        kind: 'gap',
        summary: `${name} has no statement covering ${gap.from} to ${gap.to} (${gap.days} days), so transactions may be missing.`,
        account: name,
        from: gap.from,
        to: gap.to,
        howToFix: `Upload the statement for ${gap.from} to ${gap.to} for ${name}.`,
      })
    }

    for (const overlap of acc.overlaps) {
      const skipped = overlap.statementIds
        .map((id) => statementInfo.get(id)?.skippedDuplicateCount ?? 0)
        .reduce((a, b) => a + b, 0)
      const issue: HealthIssue = {
        kind: 'overlap',
        summary: `Two statements of ${name} overlap from ${overlap.from} to ${overlap.to} (${overlap.days} days).`,
        account: name,
        from: overlap.from,
        to: overlap.to,
        howToFix: `If numbers look doubled for that period, check Review → Duplicates tab; otherwise nothing to do.`,
      }
      if (skipped > 0) {
        issue.summary += ` Informational: ${skipped} duplicate rows were already skipped at import.`
        issue.likelyFalseAlarm = true
        issue.falseAlarmReason =
          'Duplicates in the overlap were skipped when the statement was imported.'
        falseAlarms.push(issue)
      } else {
        real.push(issue)
      }
    }

    for (const brk of acc.balanceBreaks) {
      const issue: HealthIssue = {
        kind: 'balance_break',
        summary: `${name}: the statement ending ${brk.afterDate} closed at ${brk.previousClosing} but the next one opens at ${brk.nextOpening} (difference ${money(brk.difference)}).`,
        account: name,
        from: brk.afterDate,
        amount: round2(Math.abs(brk.difference)),
        howToFix: `Check for a missing statement or transactions around ${brk.afterDate}; upload any missing statement for ${name}.`,
      }
      if (isOverlapBreak(brk, acc.overlaps)) {
        issue.likelyFalseAlarm = true
        issue.falseAlarmReason =
          'The statements overlap in date range, so the next one opens before the previous one closes; the balances are not expected to match.'
        falseAlarms.push(issue)
      } else {
        real.push(issue)
      }
    }

    let pinpointed = 0
    for (const rec of acc.reconciliation) {
      if (rec.status === 'unverifiable') {
        real.push({
          kind: 'unverifiable_statement',
          summary: `${rec.filename} (${rec.periodStart} to ${rec.periodEnd}) of ${name} cannot be checked because its opening or closing balance is missing.`,
          account: name,
          from: rec.periodStart,
          to: rec.periodEnd,
          howToFix: `Settings → Data Health: open the statement for ${name} and enter the missing balance.`,
        })
        continue
      }
      const difference = rec.difference ?? 0
      const issue: HealthIssue = {
        kind: 'statement_mismatch',
        summary: `${rec.filename} (${rec.periodStart} to ${rec.periodEnd}) of ${name}: transactions add up to ${rec.expectedClosing} but the statement closes at ${rec.closingBalance}, off by ${money(difference)}.`,
        account: name,
        from: rec.periodStart,
        to: rec.periodEnd,
        amount: round2(Math.abs(difference)),
        howToFix: `Check the listed transactions in ${name}; remove a duplicate in Review → Duplicates tab, or add a missing transaction on the Transactions page.`,
      }
      if (pinpointed < MAX_ISSUES) {
        pinpointed++
        const rows = await loadAccountRows(userId, acc.accountId, rec.periodStart, rec.periodEnd)
        const suspects = findSuspects(rows, rec.periodStart, rec.periodEnd, difference)
        if (suspects.length > 0) {
          issue.suspectTransactions = suspects
          const ids = new Set(suspects.map((s) => s.id))
          const match = groupSummaries.find((g) => g.transactions.some((t) => ids.has(t.id)))
          if (match) issue.duplicateGroup = match
        }
      }
      real.push(issue)
    }

    if (acc.isStale) {
      real.push({
        kind: 'stale_account',
        summary: `${name} has no statement for ${acc.daysSinceLastStatement ?? 'many'} days (covered to ${acc.coveredTo ?? 'unknown'}).`,
        account: name,
        to: acc.coveredTo ?? undefined,
        howToFix: `Upload the latest statement for ${name}.`,
      })
    }

    for (const m of acc.missingPeriod) {
      real.push({
        kind: 'missing_period',
        summary: `${m.filename} of ${name} has no period dates, so coverage checks guess them.`,
        account: name,
        howToFix: STATEMENTS_PAGE,
      })
    }
  }

  for (const item of report.cardPayments.items) {
    real.push({
      kind: 'card_payment',
      summary: `Card payment of ${item.amount} on ${item.date} in ${item.accountName} (${item.kind.replace(/_/g, ' ')}).`,
      account: item.accountName,
      from: item.date,
      amount: item.amount,
      howToFix:
        'Review → Card payments: link it to the matching card or bank transaction, or mark it as correct.',
    })
  }

  if (report.lowConfidence.count > 0) {
    real.push({
      kind: 'low_confidence',
      summary: `${report.lowConfidence.count} transactions have an uncertain category (total ${round2(report.lowConfidence.total)}).`,
      amount: round2(report.lowConfidence.total),
      howToFix:
        'Review → Fix issues button re-checks them, or set the category on the Transactions page.',
    })
  }

  for (const group of groupSummaries) {
    const first = group.transactions[0]
    real.push({
      kind: 'duplicate_group',
      summary: `${group.transactions.length} ${group.tier === 'sure' ? 'certain' : 'possible'} copies of ${first?.amount} on ${first?.date}.`,
      from: first?.date,
      amount: first?.amount,
      howToFix: REVIEW_DUPLICATES,
      duplicateGroup: group,
    })
  }

  const all = [...real, ...falseAlarms]
  const cap = includeDetails ? MAX_ISSUES_DETAILED : MAX_ISSUES

  let autoFixable: DataHealthSummary['autoFixable'] = null
  if (user?.country) {
    try {
      const previews = await previewFixes({
        userId,
        profileId,
        countryCode: user.country as CountryCode,
      })
      autoFixable = previews
        .filter((p) => p.count > 0)
        .map((p) => ({ fixer: p.fixer, label: p.label, count: p.count }))
    } catch (error) {
      logger.error('[Chat] Previewing fixes failed:', error)
    }
  }

  return {
    issueCount: report.issueCount,
    realIssueCount: real.length,
    issues: all.slice(0, cap),
    omittedIssues: Math.max(0, all.length - cap),
    duplicateGroupCount: groups.length,
    autoFixable,
  }
}
