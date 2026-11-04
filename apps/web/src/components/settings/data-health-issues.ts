/**
 * Data health issues: flattened from the report, with the checks the user chose to ignore
 */

import { formatCurrency } from '@/components/dashboard/utils'
import type { DataHealthReport } from '@/lib/api'

export type IssueTarget =
  /** Statements page narrowed to the statements (or account) behind the issue */
  | { page: 'statements'; statementIds?: string[]; accountId?: string }
  | { page: 'transactions'; category?: string; statementId?: string }
  | { page: 'review' }

export interface Issue {
  key: string
  label: string
  detail: string
  target: IssueTarget
}

export function formatLongDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatRange(from: string, to: string): string {
  return `${formatLongDate(from)} - ${formatLongDate(to)}`
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/** Flatten the report into one list of things to look at, most structural first */
export function collectIssues(report: DataHealthReport): Issue[] {
  const issues: Issue[] = []
  const unverifiableIds: string[] = []

  for (const account of report.accounts) {
    if (account.isStale) {
      issues.push({
        key: `stale-${account.accountId}`,
        label: `${account.accountName} is out of date`,
        detail:
          account.coveredTo === null
            ? 'No statements uploaded'
            : `Last statement ends ${formatLongDate(account.coveredTo)} (${plural(account.daysSinceLastStatement ?? 0, 'day')} ago)`,
        target: { page: 'statements', accountId: account.accountId },
      })
    }
    for (const gap of account.gaps) {
      issues.push({
        key: `gap-${gap.afterStatementId}-${gap.beforeStatementId}`,
        label: `${account.accountName}: missing statement`,
        detail: `${formatRange(gap.from, gap.to)} (${plural(gap.days, 'day')} not covered)`,
        target: {
          page: 'statements',
          statementIds: [gap.afterStatementId, gap.beforeStatementId],
        },
      })
    }
    for (const overlap of account.overlaps) {
      issues.push({
        key: `overlap-${overlap.statementIds.join('-')}`,
        label: `${account.accountName}: overlapping statements`,
        detail: `${formatRange(overlap.from, overlap.to)} may be counted twice`,
        target: { page: 'statements', statementIds: overlap.statementIds },
      })
    }
    for (const brk of account.balanceBreaks) {
      issues.push({
        key: `break-${brk.previousStatementId}-${brk.nextStatementId}`,
        label: `${account.accountName}: balance doesn't carry over`,
        detail: `Closing ${formatCurrency(brk.previousClosing)} on ${formatLongDate(brk.afterDate)}, next statement opens at ${formatCurrency(brk.nextOpening)}`,
        target: {
          page: 'statements',
          statementIds: [brk.previousStatementId, brk.nextStatementId],
        },
      })
    }
    for (const missing of account.missingPeriod) {
      issues.push({
        key: `period-${missing.statementId}`,
        label: `${account.accountName}: statement has no period dates`,
        detail:
          missing.periodStart && missing.periodEnd
            ? `${missing.filename}: assumed ${formatRange(missing.periodStart, missing.periodEnd)}; set the period to confirm`
            : `${missing.filename}: set the period so it counts towards coverage`,
        target: { page: 'statements', statementIds: [missing.statementId] },
      })
    }
    for (const rec of account.reconciliation) {
      if (rec.status === 'unverifiable') {
        unverifiableIds.push(rec.statementId)
        continue
      }
      const deleted =
        rec.deletedTransactionCount > 0
          ? `, ${plural(rec.deletedTransactionCount, 'transaction')} deleted since import`
          : ''
      issues.push({
        key: `rec-${rec.statementId}`,
        label: `${account.accountName}: statement doesn't add up`,
        detail: `${formatRange(rec.periodStart, rec.periodEnd)} is off by ${formatCurrency(Math.abs(rec.difference ?? 0))}${deleted}`,
        target: { page: 'transactions', statementId: rec.statementId },
      })
    }
  }

  if (report.lowConfidence.count > 0) {
    issues.push({
      key: 'low-confidence',
      label: `${plural(report.lowConfidence.count, 'transaction')} with a shaky category`,
      detail: `${formatCurrency(report.lowConfidence.total)} total; confirm the category in Review`,
      target: { page: 'review' },
    })
  }
  if (unverifiableIds.length > 0) {
    issues.push({
      key: 'unverifiable',
      label: `${plural(unverifiableIds.length, 'statement')} can't be checked`,
      detail: 'Opening or closing balance is missing',
      target: { page: 'statements', statementIds: unverifiableIds },
    })
  }

  return issues
}

/**
 * Balance problems of freshly imported statements: one that doesn't add up, one that can't be
 * checked, or one whose opening doesn't follow the previous statement's closing
 */
export function collectImportWarnings(report: DataHealthReport, statementIds: string[]): string[] {
  const fresh = new Set(statementIds)
  const warnings: string[] = []
  for (const account of report.accounts) {
    for (const rec of account.reconciliation) {
      if (!fresh.has(rec.statementId)) continue
      warnings.push(
        rec.status === 'unverifiable'
          ? `${rec.filename} can't be checked: its opening or closing balance is missing`
          : `${rec.filename} doesn't add up: off by ${formatCurrency(Math.abs(rec.difference ?? 0))}`
      )
    }
    for (const brk of account.balanceBreaks) {
      if (!fresh.has(brk.nextStatementId) && !fresh.has(brk.previousStatementId)) continue
      warnings.push(
        `${account.accountName}: balance doesn't carry over on ${formatLongDate(brk.afterDate)} (off by ${formatCurrency(Math.abs(brk.difference))})`
      )
    }
  }
  return warnings
}

/** Question to hand Ask Penny so it explains an issue and helps fix it */
export function buildIssueQuestion(issue: Issue): string {
  return `Explain this data issue and help me fix it: ${issue.label} — ${issue.detail}. Use the data health tool to find the exact transactions or statements involved.`
}

export function parseIgnored(value: string | undefined): string[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((key): key is string => typeof key === 'string')
      : []
  } catch {
    return []
  }
}

/**
 * Data issues still open on the dashboard: what Settings lists, minus the checks the user
 * ignored, plus open card payments. The shaky-category check is left out: it has its own review queue.
 */
export function countOpenDataIssues(
  report: DataHealthReport,
  ignoredValue: string | undefined
): number {
  const ignoredKeys = parseIgnored(ignoredValue)
  const open = collectIssues(report).filter(
    (issue) => issue.key !== 'low-confidence' && !ignoredKeys.includes(issue.key)
  )
  return open.length + report.cardPayments.items.length
}
