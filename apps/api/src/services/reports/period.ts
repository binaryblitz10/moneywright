import { computeCashFlow, computeSavings, toBreakdown, type CashFlowResult } from '../cashflow'
import { getAccountsByUserId } from '../accounts'
import { getCashflowExcludedCategories } from '../preferences'
import { getCategoryKind } from '../../lib/constants'
import { categoryLabel } from '../spending-changes'
import { computeTotals, type TotalsGroup } from '../transaction-totals'
import { getDataHealth, type CashBridge, type DataHealthReport } from '../data-health'
import {
  changeBetween,
  compareGroups,
  getReportBounds,
  inRange,
  loadReportTransactions,
  resolvePeriod,
  toReportAccount,
  type Change,
  type ComparedRow,
  type ReportAccount,
  type ReportPeriod,
  type ReportTransaction,
} from './shared'

/**
 * Period report
 * One month, or consecutive months, against the same number of months just before:
 * totals, every category and merchant, per-account flows, where the savings went and
 * the data problems that touch the period.
 */

export interface PeriodTotals {
  income: number
  expenses: number
  invested: number
  /** income - expenses */
  surplus: number
  /** surplus / income as a fraction; null without income */
  savingsRate: number | null
}

export interface PeriodTotalsComparison {
  current: PeriodTotals
  /** Null without a comparison period */
  previous: PeriodTotals | null
  changes: Record<'income' | 'expenses' | 'invested' | 'surplus', Change> | null
  /** Savings rate now minus before, in fractions (0.05 = 5 points); null when either is unknown */
  savingsRateDelta: number | null
}

export interface AccountFlow {
  income: number
  expenses: number
  invested: number
}

export interface AccountFlowRow extends ReportAccount {
  current: AccountFlow
  previous: AccountFlow | null
}

export interface SavingsBreakdown {
  /** 'insufficient' when some account's balance is unknown at the period's edges */
  status: 'ok' | 'insufficient'
  surplus: number
  invested: number
  /** Change in bank balances; null when insufficient */
  bankChange: number | null
  /** Card dues paid down (positive) or grown (negative); null when insufficient */
  cardDuesReduced: number | null
  /** Part of the surplus the balances don't explain: invested + banks + cards + unexplained = surplus */
  unexplained: number | null
  missingAccounts: Array<{ accountId: string; accountName: string }>
}

export type WarningKind =
  | 'missing_statements'
  | 'overlap'
  | 'coverage'
  | 'balance_break'
  | 'mismatch'
  | 'unlinked_payment'

export interface PeriodWarning {
  kind: WarningKind
  accountName: string
  message: string
  /** Set for unlinked card payments */
  amount: number | null
}

export interface PeriodWarnings {
  count: number
  items: PeriodWarning[]
}

export interface PeriodReportData {
  totals: PeriodTotalsComparison
  expenseCategories: ComparedRow[]
  incomeCategories: ComparedRow[]
  investmentCategories: ComparedRow[]
  merchants: ComparedRow[]
  accounts: AccountFlowRow[]
}

export interface PeriodReportResponse extends PeriodReportData {
  period: ReportPeriod
  savings: SavingsBreakdown
  warnings: PeriodWarnings
  currency: string
}

/** Most warnings returned; the count still covers all of them */
const MAX_WARNINGS = 20

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/** e.g. "3 Mar 2026" */
function formatDay(date: string): string {
  const [year, month = 1, day = 1] = date.split('-').map(Number)
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`
}

function toPeriodTotals(
  cf: Pick<CashFlowResult, 'income' | 'expenses' | 'invested'>
): PeriodTotals {
  const { surplus, savingsRate } = computeSavings(cf)
  return { income: cf.income, expenses: cf.expenses, invested: cf.invested, surplus, savingsRate }
}

function compareTotals(
  current: PeriodTotals,
  previous: PeriodTotals | null
): PeriodTotalsComparison {
  if (!previous) return { current, previous: null, changes: null, savingsRateDelta: null }
  return {
    current,
    previous,
    changes: {
      income: changeBetween(previous.income, current.income),
      expenses: changeBetween(previous.expenses, current.expenses),
      invested: changeBetween(previous.invested, current.invested),
      surplus: changeBetween(previous.surplus, current.surplus),
    },
    savingsRateDelta:
      current.savingsRate !== null && previous.savingsRate !== null
        ? current.savingsRate - previous.savingsRate
        : null,
  }
}

/** Categories of one kind as comparable groups */
function categoryGroups(
  cf: Pick<CashFlowResult, 'byCategory'> | null,
  kind: 'income' | 'expense' | 'investment'
) {
  return cf
    ? toBreakdown(cf.byCategory, kind).map<TotalsGroup>((c) => ({
        key: c.category,
        label: categoryLabel(c.category),
        total: c.total,
        count: c.count,
      }))
    : null
}

function merchantGroups(transactions: ReportTransaction[]): TotalsGroup[] {
  return computeTotals(
    transactions.filter((t) => getCategoryKind(t.category) === 'expense'),
    { kind: 'expense', groupBy: 'merchant' }
  ).groups
}

function accountFlow(transactions: ReportTransaction[], accountId: string): AccountFlow {
  const cf = computeCashFlow(transactions.filter((t) => t.accountId === accountId))
  return { income: cf.income, expenses: cf.expenses, invested: cf.invested }
}

/**
 * Pure calculation - no DB access (unit tested)
 * `previous` is null when there is no comparison period. Excluded categories are dropped
 * from everything, like the dashboard.
 */
export function computePeriodReport(input: {
  current: ReportTransaction[]
  previous: ReportTransaction[] | null
  accounts: ReportAccount[]
  excludeCategories: string[]
}): PeriodReportData {
  const excluded = new Set(input.excludeCategories)
  const keep = (list: ReportTransaction[]) => list.filter((t) => !excluded.has(t.category))
  const current = keep(input.current)
  const previous = input.previous ? keep(input.previous) : null

  const currentCf = computeCashFlow(current)
  const previousCf = previous ? computeCashFlow(previous) : null

  const accounts: AccountFlowRow[] = []
  for (const account of input.accounts) {
    const hasData = (list: ReportTransaction[] | null) =>
      list?.some((t) => t.accountId === account.id) ?? false
    if (!hasData(current) && !hasData(previous)) continue
    accounts.push({
      ...account,
      current: accountFlow(current, account.id),
      previous: previous ? accountFlow(previous, account.id) : null,
    })
  }
  accounts.sort((a, b) => b.current.expenses - a.current.expenses)

  return {
    totals: compareTotals(
      toPeriodTotals(currentCf),
      previousCf ? toPeriodTotals(previousCf) : null
    ),
    expenseCategories: compareGroups(
      categoryGroups(currentCf, 'expense')!,
      categoryGroups(previousCf, 'expense')
    ),
    incomeCategories: compareGroups(
      categoryGroups(currentCf, 'income')!,
      categoryGroups(previousCf, 'income')
    ),
    investmentCategories: compareGroups(
      categoryGroups(currentCf, 'investment')!,
      categoryGroups(previousCf, 'investment')
    ),
    merchants: compareGroups(merchantGroups(current), previous ? merchantGroups(previous) : null),
    accounts,
  }
}

/**
 * Where the surplus went, from the cash bridge. Surplus = invested + bank balance change
 * + card dues paid down + whatever the balances don't explain.
 */
export function buildSavingsBreakdown(surplus: number, bridge: CashBridge): SavingsBreakdown {
  const base = { surplus, invested: bridge.invested, missingAccounts: bridge.missingAccounts }
  if (bridge.status === 'insufficient') {
    return {
      ...base,
      status: 'insufficient',
      bankChange: null,
      cardDuesReduced: null,
      unexplained: null,
    }
  }
  const sumDelta = (kind: 'bank' | 'card') =>
    bridge.accounts.filter((a) => a.kind === kind).reduce((sum, a) => sum + (a.delta ?? 0), 0)
  return {
    ...base,
    status: 'ok',
    bankChange: sumDelta('bank'),
    cardDuesReduced: -sumDelta('card'),
    unexplained: bridge.residual === null ? null : -bridge.residual,
  }
}

/**
 * Pure calculation - no DB access (unit tested)
 * The data-health findings that touch the period: statement gaps and overlaps, accounts
 * whose statements don't cover it, broken balance chains, mismatching statements and
 * card payments not linked to a card.
 */
export function collectPeriodWarnings(
  health: Pick<DataHealthReport, 'accounts' | 'unlinkedCardPayments'>,
  startDate: string,
  endDate: string
): PeriodWarnings {
  const touches = (from: string, to: string) => from <= endDate && to >= startDate
  const items: PeriodWarning[] = []

  for (const account of health.accounts) {
    const name = account.accountName
    const add = (kind: WarningKind, message: string) =>
      items.push({ kind, accountName: name, message, amount: null })

    if (account.coveredFrom === null || account.coveredTo === null) {
      add('coverage', 'No statements uploaded')
    } else {
      if (account.coveredFrom > startDate) {
        add('coverage', `Statements only start on ${formatDay(account.coveredFrom)}`)
      }
      if (account.coveredTo < endDate) {
        add('coverage', `Statements only run until ${formatDay(account.coveredTo)}`)
      }
    }
    for (const gap of account.gaps) {
      if (touches(gap.from, gap.to)) {
        add(
          'missing_statements',
          `No statement from ${formatDay(gap.from)} to ${formatDay(gap.to)}`
        )
      }
    }
    for (const overlap of account.overlaps) {
      if (touches(overlap.from, overlap.to)) {
        add(
          'overlap',
          `Statements overlap from ${formatDay(overlap.from)} to ${formatDay(overlap.to)}; transactions may be counted twice`
        )
      }
    }
    for (const brk of account.balanceBreaks) {
      if (brk.afterDate >= startDate && brk.afterDate <= endDate) {
        add('balance_break', `Balance doesn't carry over after ${formatDay(brk.afterDate)}`)
      }
    }
    for (const rec of account.reconciliation) {
      if (rec.status === 'mismatch' && touches(rec.periodStart, rec.periodEnd)) {
        add(
          'mismatch',
          `Statement ${formatDay(rec.periodStart)} to ${formatDay(rec.periodEnd)} doesn't add up to its closing balance`
        )
      }
    }
  }

  for (const payment of health.unlinkedCardPayments.items) {
    if (payment.date < startDate || payment.date > endDate) continue
    items.push({
      kind: 'unlinked_payment',
      accountName: payment.accountName,
      message: `Card payment on ${formatDay(payment.date)} isn't linked to a card`,
      amount: payment.amount,
    })
  }

  return { count: items.length, items: items.slice(0, MAX_WARNINGS) }
}

/**
 * Period report for a range of complete months
 */
export async function getPeriodReport(
  userId: string,
  options: { profileId?: string; from: string; to: string }
): Promise<PeriodReportResponse> {
  const { profileId } = options
  const bounds = await getReportBounds(userId, profileId)
  const period = resolvePeriod(options.from, options.to, bounds.earliestMonth)
  const { comparison } = period

  const [loaded, accounts, excludeCategories, health] = await Promise.all([
    loadReportTransactions(userId, {
      profileId,
      startDate: comparison?.startDate ?? period.startDate,
      endDate: period.endDate,
    }),
    getAccountsByUserId(userId, profileId),
    getCashflowExcludedCategories(userId),
    getDataHealth(userId, { profileId, startDate: period.startDate, endDate: period.endDate }),
  ])

  const report = computePeriodReport({
    current: inRange(loaded.transactions, period),
    previous: comparison ? inRange(loaded.transactions, comparison) : null,
    accounts: accounts.map(toReportAccount),
    excludeCategories,
  })

  return {
    ...report,
    period,
    savings: buildSavingsBreakdown(report.totals.current.surplus, health.bridge),
    warnings: collectPeriodWarnings(health, period.startDate, period.endDate),
    currency: loaded.currency,
  }
}
