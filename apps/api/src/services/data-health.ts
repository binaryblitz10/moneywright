import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { db, tables } from '../db'
import { getAccountsByUserId } from './accounts'
import { getCashFlow } from './cashflow'
import { LOW_CONFIDENCE_BELOW } from './transactions'

/**
 * Data health service
 * Answers "can I trust the numbers?": statement coverage, gaps and overlaps, balance
 * reconciliation, unlinked card payments and a cash bridge that
 * ties the change in account balances back to income - expenses - invested.
 * The checks are pure functions over plain rows; getDataHealth only loads and assembles.
 */

/** Differences up to this amount (in account currency) are rounding noise */
const BALANCE_TOLERANCE = 1
/** A statement older than this many days makes the account stale */
const STALE_AFTER_DAYS = 45
const DAY_MS = 86_400_000

export type AccountKind = 'bank' | 'card'

/** A completed statement as needed by the checks */
export interface StatementLite {
  id: string
  accountId: string
  /** Effective period: the stored dates, or inferred when the statement has none */
  periodStart: string
  periodEnd: string
  /** True when periodStart and/or periodEnd were inferred rather than stored */
  periodInferred: boolean
  openingBalance: number | null
  closingBalance: number | null
  deletedTransactionCount: number
  filename: string
}

/** A completed statement as stored: the period dates can be missing */
export interface RawStatement extends Omit<
  StatementLite,
  'periodStart' | 'periodEnd' | 'periodInferred'
> {
  periodStart: string | null
  periodEnd: string | null
}

/** A transaction as needed by the checks */
export interface TxnLite {
  id: string
  accountId: string
  statementId: string | null
  date: string
  type: 'credit' | 'debit'
  amount: number
  category: string
  summary: string | null
  isHidden: boolean
  linkedEntityId: string | null
}

export interface DateGap {
  from: string
  to: string
  days: number
  /** The statements either side of the gap */
  afterStatementId: string
  beforeStatementId: string
}

export interface StatementOverlap {
  from: string
  to: string
  days: number
  statementIds: [string, string]
}

export interface BalanceBreak {
  /** Date of the earlier statement's end */
  afterDate: string
  previousStatementId: string
  nextStatementId: string
  previousClosing: number
  nextOpening: number
  difference: number
}

export type ReconciliationStatus = 'ok' | 'mismatch' | 'unverifiable'

export interface StatementReconciliation {
  statementId: string
  filename: string
  periodStart: string
  periodEnd: string
  periodInferred: boolean
  status: ReconciliationStatus
  openingBalance: number | null
  closingBalance: number | null
  expectedClosing: number | null
  /** closing - expected; null when unverifiable */
  difference: number | null
  deletedTransactionCount: number
}

/** A statement stored without (both) period dates; the user can set them on the statements page */
export interface MissingPeriodStatement {
  statementId: string
  filename: string
  /** Effective dates used by the checks; null when they could not be derived */
  periodStart: string | null
  periodEnd: string | null
}

export interface UnlinkedCardPayment {
  id: string
  date: string
  amount: number
  summary: string | null
  accountId: string
  accountName: string
}

export interface AccountCoverage {
  accountId: string
  accountName: string
  type: string
  statementCount: number
  coveredFrom: string | null
  coveredTo: string | null
  daysSinceLastStatement: number | null
  isStale: boolean
  gaps: DateGap[]
  overlaps: StatementOverlap[]
  balanceBreaks: BalanceBreak[]
  /** Statements stored without period dates (dates are inferred for the checks) */
  missingPeriod: MissingPeriodStatement[]
  /** Only statements that need attention (mismatch or unverifiable) */
  reconciliation: StatementReconciliation[]
}

export interface BridgeAccountDelta {
  accountId: string
  accountName: string
  kind: AccountKind
  balanceBefore: number | null
  balanceAfter: number | null
  delta: number | null
}

export interface CashBridge {
  /** 'insufficient' = some account's balance is unknown at the range edges */
  status: 'ok' | 'insufficient'
  startDate: string
  endDate: string
  accounts: BridgeAccountDelta[]
  missingAccounts: Array<{ accountId: string; accountName: string }>
  /** Σ bank Δ − Σ card Δ; null when insufficient */
  netChange: number | null
  income: number
  expenses: number
  invested: number
  /** income - expenses - invested */
  explained: number
  /** netChange - explained; null when insufficient */
  residual: number | null
}

export interface DataHealthReport {
  /** Earliest coveredTo across active accounts with statements: everything up to here is complete */
  dataThrough: string | null
  latestData: string | null
  issueCount: number
  accounts: AccountCoverage[]
  unlinkedCardPayments: { count: number; total: number; items: UnlinkedCardPayment[] }
  lowConfidence: { count: number; total: number }
  bridge: CashBridge
}

// ============================================================================
// Pure helpers
// ============================================================================

function toNumber(value: unknown): number {
  return typeof value === 'string' ? parseFloat(value) : Number(value)
}

function toMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`)
}

/** Whole days from a to b (b - a) */
export function daysBetween(a: string, b: string): number {
  return Math.round((toMs(b) - toMs(a)) / DAY_MS)
}

export function addDays(date: string, days: number): string {
  return new Date(toMs(date) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Indian financial year start (1 April) containing the given date */
export function financialYearStart(today: string): string {
  const [year = 0, month = 1] = today.split('-').map(Number)
  return `${month >= 4 ? year : year - 1}-04-01`
}

function sortByPeriod(statements: StatementLite[]): StatementLite[] {
  return [...statements].sort(
    (a, b) => a.periodStart.localeCompare(b.periodStart) || a.periodEnd.localeCompare(b.periodEnd)
  )
}

function balancesChain(
  prev: Pick<StatementLite, 'closingBalance'>,
  next: Pick<StatementLite, 'openingBalance'>
): boolean {
  return (
    prev.closingBalance !== null &&
    next.openingBalance !== null &&
    Math.abs(next.openingBalance - prev.closingBalance) <= BALANCE_TOLERANCE
  )
}

interface PeriodDraft {
  raw: RawStatement
  start: string | null
  end: string | null
  startInferred: boolean
  endInferred: boolean
}

/**
 * Effective periods for ONE account's statements. Missing dates come from the statement's
 * transactions (min / max date), else from the neighbouring statements (day after the previous
 * end, day before the next start). Statements with no dates and no transactions are ordered by
 * opening/closing balance continuity. When inferred transaction dates leave a gap between two
 * statements whose balances chain, the inferred side is stretched over it. Statements whose
 * period cannot be derived at all are left out.
 */
export function resolveStatementPeriods(
  raw: RawStatement[],
  txnDates: Map<string, string[]>
): StatementLite[] {
  const drafts: PeriodDraft[] = raw.map((r) => {
    let min: string | null = null
    let max: string | null = null
    for (const d of txnDates.get(r.id) ?? []) {
      if (min === null || d < min) min = d
      if (max === null || d > max) max = d
    }
    return {
      raw: r,
      start: r.periodStart ?? min,
      end: r.periodEnd ?? max,
      startInferred: !r.periodStart,
      endInferred: !r.periodEnd,
    }
  })

  const ordered = drafts
    .filter((d) => d.start ?? d.end)
    .sort(
      (a, b) =>
        (a.start ?? a.end!).localeCompare(b.start ?? b.end!) ||
        (a.end ?? a.start!).localeCompare(b.end ?? b.start!)
    )

  // No dates and no transactions: slot in by balance continuity
  let pending = drafts.filter((d) => !d.start && !d.end)
  let progressed = true
  while (progressed && pending.length > 0) {
    progressed = false
    for (const u of pending) {
      const after = ordered.findIndex((d) => balancesChain(d.raw, u.raw))
      const before = ordered.findIndex((d) => balancesChain(u.raw, d.raw))
      if (after >= 0) ordered.splice(after + 1, 0, u)
      else if (before >= 0) ordered.splice(before, 0, u)
      else continue
      pending = pending.filter((p) => p !== u)
      progressed = true
      break
    }
  }

  // Neighbour fallbacks
  for (let i = 0; i < ordered.length; i++) {
    const d = ordered[i]!
    const prevEnd = ordered[i - 1]?.end
    if (d.start === null && prevEnd) d.start = addDays(prevEnd, 1)
  }
  for (let i = ordered.length - 1; i >= 0; i--) {
    const d = ordered[i]!
    const nextStart = ordered[i + 1]?.start
    if (d.end === null && nextStart) d.end = addDays(nextStart, -1)
  }
  const placed = ordered.filter((d) => d.start !== null && d.end !== null)
  for (const d of placed) if (d.end! < d.start!) d.end = d.start

  // Inferred transaction dates can leave a few days between statements whose balances chain
  for (let i = 1; i < placed.length; i++) {
    const prev = placed[i - 1]!
    const cur = placed[i]!
    if (cur.start! <= addDays(prev.end!, 1) || !balancesChain(prev.raw, cur.raw)) continue
    if (cur.startInferred) cur.start = addDays(prev.end!, 1)
    else if (prev.endInferred) prev.end = addDays(cur.start!, -1)
  }

  return placed.map((d) => ({
    ...d.raw,
    periodStart: d.start!,
    periodEnd: d.end!,
    periodInferred: d.startInferred || d.endInferred,
  }))
}

/** Statements stored without both period dates, with the effective dates when derived */
export function findMissingPeriods(
  raw: RawStatement[],
  resolved: StatementLite[]
): MissingPeriodStatement[] {
  const byId = new Map(resolved.map((s) => [s.id, s]))
  return raw
    .filter((r) => !r.periodStart || !r.periodEnd)
    .map((r) => ({
      statementId: r.id,
      filename: r.filename,
      periodStart: byId.get(r.id)?.periodStart ?? null,
      periodEnd: byId.get(r.id)?.periodEnd ?? null,
    }))
}

/**
 * Bank debits in the card payment category with no link on either side.
 * `linkedTargets` holds every id some transaction links to: older auto-linking only set
 * the card-side credit's link, so a payment counts as linked when the card side points at it.
 */
export function findUnlinkedCardPayments<T extends TxnLite>(
  txns: T[],
  bankAccountIds: Set<string>,
  linkedTargets: Set<string>
): T[] {
  return txns.filter(
    (t) =>
      !t.isHidden &&
      bankAccountIds.has(t.accountId) &&
      t.type === 'debit' &&
      t.category === 'credit_card_payment' &&
      !t.linkedEntityId &&
      !linkedTargets.has(t.id)
  )
}

/** Signed effect of a transaction on its account's balance */
export function signedAmount(kind: AccountKind, type: 'credit' | 'debit', amount: number): number {
  const sign = type === 'credit' ? 1 : -1
  return kind === 'bank' ? sign * amount : -sign * amount
}

/**
 * Uncovered date ranges and overlaps between consecutive statements of one account
 */
export function findGapsAndOverlaps(statements: StatementLite[]): {
  gaps: DateGap[]
  overlaps: StatementOverlap[]
} {
  const sorted = sortByPeriod(statements)
  const gaps: DateGap[] = []
  const overlaps: StatementOverlap[] = []
  // Track the statement reaching furthest so a short statement nested in a long one isn't a gap
  let reach = sorted[0]

  for (const next of sorted.slice(1)) {
    if (!reach) break
    if (next.periodStart <= reach.periodEnd) {
      const to = next.periodEnd < reach.periodEnd ? next.periodEnd : reach.periodEnd
      overlaps.push({
        from: next.periodStart,
        to,
        days: daysBetween(next.periodStart, to) + 1,
        statementIds: [reach.id, next.id],
      })
    } else if (next.periodStart > addDays(reach.periodEnd, 1)) {
      const from = addDays(reach.periodEnd, 1)
      const to = addDays(next.periodStart, -1)
      gaps.push({
        from,
        to,
        days: daysBetween(from, to) + 1,
        afterStatementId: reach.id,
        beforeStatementId: next.id,
      })
    }
    if (next.periodEnd > reach.periodEnd) reach = next
  }

  return { gaps, overlaps }
}

/**
 * Consecutive statements whose closing and opening balances disagree
 */
export function findBalanceBreaks(statements: StatementLite[]): BalanceBreak[] {
  const sorted = sortByPeriod(statements)
  const breaks: BalanceBreak[] = []

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    const next = sorted[i]!
    if (prev.closingBalance === null || next.openingBalance === null) continue
    const difference = next.openingBalance - prev.closingBalance
    if (Math.abs(difference) > BALANCE_TOLERANCE) {
      breaks.push({
        afterDate: prev.periodEnd,
        previousStatementId: prev.id,
        nextStatementId: next.id,
        previousClosing: prev.closingBalance,
        nextOpening: next.openingBalance,
        difference,
      })
    }
  }

  return breaks
}

/**
 * Check opening + movements = closing for one statement. Pass ALL of the statement's
 * transactions, hidden ones included: hidden only means excluded from analytics.
 */
export function reconcileStatement(
  kind: AccountKind,
  statement: StatementLite,
  txns: Array<Pick<TxnLite, 'type' | 'amount'>>
): StatementReconciliation {
  const base = {
    statementId: statement.id,
    filename: statement.filename,
    periodStart: statement.periodStart,
    periodEnd: statement.periodEnd,
    periodInferred: statement.periodInferred,
    openingBalance: statement.openingBalance,
    closingBalance: statement.closingBalance,
    deletedTransactionCount: statement.deletedTransactionCount,
  }
  // A card statement with no previous balance (e.g. a new card) has no opening line: treat it as 0
  const openingBalance = statement.openingBalance ?? (kind === 'card' ? 0 : null)
  if (openingBalance === null || statement.closingBalance === null) {
    return { ...base, status: 'unverifiable', expectedClosing: null, difference: null }
  }

  const movement = txns.reduce((sum, t) => sum + signedAmount(kind, t.type, t.amount), 0)
  const expectedClosing = openingBalance + movement
  const difference = statement.closingBalance - expectedClosing
  return {
    ...base,
    status: Math.abs(difference) > BALANCE_TOLERANCE ? 'mismatch' : 'ok',
    expectedClosing,
    difference,
  }
}

/**
 * Account balance at the end of `date`, from statements plus all transactions after them.
 * Uses the last statement ending on/before the date (closing balance), else the statement
 * containing the date (opening balance). Null when neither exists.
 */
export function computeBalanceAt(
  kind: AccountKind,
  statements: StatementLite[],
  txns: Array<Pick<TxnLite, 'date' | 'type' | 'amount'>>,
  date: string
): number | null {
  const sorted = sortByPeriod(statements)
  const sumBetween = (afterExclusive: string | null, untilInclusive: string): number =>
    txns
      .filter(
        (t) => (afterExclusive === null || t.date > afterExclusive) && t.date <= untilInclusive
      )
      .reduce((sum, t) => sum + signedAmount(kind, t.type, t.amount), 0)

  const before = sorted.filter((s) => s.periodEnd <= date && s.closingBalance !== null).pop()
  if (before) return before.closingBalance! + sumBetween(before.periodEnd, date)

  // Opening balance is the balance at the end of the day before the period starts
  const containing = sorted.find(
    (s) => s.openingBalance !== null && addDays(s.periodStart, -1) <= date && date <= s.periodEnd
  )
  if (containing) {
    return containing.openingBalance! + sumBetween(addDays(containing.periodStart, -1), date)
  }
  return null
}

// ============================================================================
// Loading and assembly
// ============================================================================

export interface DataHealthOptions {
  profileId?: string
  /** YYYY-MM-DD, defaults to the start of the current Indian financial year */
  startDate?: string
  /** YYYY-MM-DD, defaults to the earliest date every active account is covered through */
  endDate?: string
}

export function accountKind(type: string): AccountKind | null {
  if (type === 'credit_card') return 'card'
  if (type === 'savings_account' || type === 'current_account' || type === 'checking_account') {
    return 'bank'
  }
  return null
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function getDataHealth(
  userId: string,
  options: DataHealthOptions = {}
): Promise<DataHealthReport> {
  const { profileId } = options
  const allAccounts = await getAccountsByUserId(userId, profileId)
  const accounts = allAccounts.filter((a) => a.isActive && accountKind(a.type) !== null)
  const accountIds = accounts.map((a) => a.id)
  const nameById = new Map(accounts.map((a) => [a.id, a.accountName || a.institution || a.type]))
  const kindById = new Map(accounts.map((a) => [a.id, accountKind(a.type)!]))

  const emptyBridge = (startDate: string, endDate: string): CashBridge => ({
    status: 'insufficient',
    startDate,
    endDate,
    accounts: [],
    missingAccounts: [],
    netChange: null,
    income: 0,
    expenses: 0,
    invested: 0,
    explained: 0,
    residual: null,
  })

  if (accountIds.length === 0) {
    const start = options.startDate ?? financialYearStart(today())
    return {
      dataThrough: null,
      latestData: null,
      issueCount: 0,
      accounts: [],
      unlinkedCardPayments: { count: 0, total: 0, items: [] },
      lowConfidence: { count: 0, total: 0 },
      bridge: emptyBridge(start, options.endDate ?? today()),
    }
  }

  const [statementRows, txnRows, linkRows, lowRows] = await Promise.all([
    db
      .select()
      .from(tables.statements)
      .where(
        and(
          eq(tables.statements.userId, userId),
          eq(tables.statements.status, 'completed'),
          inArray(tables.statements.accountId, accountIds)
        )
      ),
    db
      .select()
      .from(tables.transactions)
      .where(
        and(
          eq(tables.transactions.userId, userId),
          inArray(tables.transactions.accountId, accountIds)
        )
      ),
    db
      .select({ target: tables.transactions.linkedEntityId })
      .from(tables.transactions)
      .where(
        and(eq(tables.transactions.userId, userId), isNotNull(tables.transactions.linkedEntityId))
      ),
    db
      .select({
        count: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(${tables.transactions.amount}), 0)`,
      })
      .from(tables.transactions)
      .where(
        and(
          eq(tables.transactions.userId, userId),
          profileId ? eq(tables.transactions.profileId, profileId) : undefined,
          eq(tables.transactions.isHidden, false),
          eq(tables.transactions.isManuallyCategorized, false),
          sql`${tables.transactions.categoryConfidence} < ${LOW_CONFIDENCE_BELOW}`
        )
      ),
  ])

  const rawStatements: RawStatement[] = statementRows.flatMap((s) =>
    s.accountId
      ? [
          {
            id: s.id,
            accountId: s.accountId,
            periodStart: s.periodStart,
            periodEnd: s.periodEnd,
            openingBalance: s.openingBalance === null ? null : toNumber(s.openingBalance),
            closingBalance: s.closingBalance === null ? null : toNumber(s.closingBalance),
            deletedTransactionCount: s.deletedTransactionCount ?? 0,
            filename: s.originalFilename,
          },
        ]
      : []
  )
  const txns: TxnLite[] = txnRows.map((t) => ({
    id: t.id,
    accountId: t.accountId,
    statementId: t.statementId,
    date: t.date,
    type: t.type as 'credit' | 'debit',
    amount: toNumber(t.amount),
    category: t.category,
    summary: t.summary,
    isHidden: !!t.isHidden,
    linkedEntityId: t.linkedEntityId,
  }))

  const rawByAccount = new Map<string, RawStatement[]>()
  for (const s of rawStatements) {
    rawByAccount.set(s.accountId, [...(rawByAccount.get(s.accountId) ?? []), s])
  }
  const txnsByAccount = new Map<string, TxnLite[]>()
  for (const t of txns)
    txnsByAccount.set(t.accountId, [...(txnsByAccount.get(t.accountId) ?? []), t])
  const txnsByStatement = new Map<string, TxnLite[]>()
  for (const t of txns) {
    if (t.statementId) {
      txnsByStatement.set(t.statementId, [...(txnsByStatement.get(t.statementId) ?? []), t])
    }
  }
  const txnDatesByStatement = new Map(
    [...txnsByStatement].map(([id, list]) => [id, list.map((t) => t.date)])
  )
  const statementsByAccount = new Map<string, StatementLite[]>()
  const missingByAccount = new Map<string, MissingPeriodStatement[]>()
  for (const [accountId, list] of rawByAccount) {
    const resolved = resolveStatementPeriods(list, txnDatesByStatement)
    statementsByAccount.set(accountId, resolved)
    missingByAccount.set(accountId, findMissingPeriods(list, resolved))
  }

  const now = today()
  const coverage: AccountCoverage[] = accounts.map((account) => {
    const kind = kindById.get(account.id)!
    const sorted = sortByPeriod(statementsByAccount.get(account.id) ?? [])
    const coveredTo = sorted.reduce<string | null>(
      (max, s) => (max === null || s.periodEnd > max ? s.periodEnd : max),
      null
    )
    const daysSince = coveredTo === null ? null : daysBetween(coveredTo, now)
    return {
      accountId: account.id,
      accountName: nameById.get(account.id)!,
      type: account.type,
      statementCount: rawByAccount.get(account.id)?.length ?? 0,
      coveredFrom: sorted[0]?.periodStart ?? null,
      coveredTo,
      daysSinceLastStatement: daysSince,
      isStale: daysSince === null || daysSince > STALE_AFTER_DAYS,
      ...findGapsAndOverlaps(sorted),
      balanceBreaks: findBalanceBreaks(sorted),
      missingPeriod: missingByAccount.get(account.id) ?? [],
      reconciliation: sorted
        .map((s) => reconcileStatement(kind, s, txnsByStatement.get(s.id) ?? []))
        .filter((r) => r.status !== 'ok'),
    }
  })

  const coveredTos = coverage.flatMap((a) => (a.coveredTo ? [a.coveredTo] : []))
  const dataThrough = coveredTos.length ? coveredTos.reduce((a, b) => (a < b ? a : b)) : null
  const latestData = coveredTos.length ? coveredTos.reduce((a, b) => (a > b ? a : b)) : null

  const linkedTargets = new Set(linkRows.flatMap((r) => (r.target ? [r.target] : [])))
  const bankAccountIds = new Set(accountIds.filter((id) => kindById.get(id) === 'bank'))
  const unlinked = findUnlinkedCardPayments(
    txns,
    bankAccountIds,
    linkedTargets
  ).map<UnlinkedCardPayment>((t) => ({
    id: t.id,
    date: t.date,
    amount: t.amount,
    summary: t.summary,
    accountId: t.accountId,
    accountName: nameById.get(t.accountId)!,
  }))

  const bridge = await buildBridge(userId, profileId, {
    accounts: accounts.map((a) => ({ id: a.id, name: nameById.get(a.id)! })),
    kindById,
    statementsByAccount,
    txnsByAccount,
    startDate: options.startDate ?? financialYearStart(now),
    endDate: options.endDate ?? dataThrough ?? now,
  })

  const lowConfidence = {
    count: Number(lowRows[0]?.count ?? 0),
    total: toNumber(lowRows[0]?.total ?? 0),
  }

  const issueCount =
    coverage.reduce(
      (sum, a) =>
        sum +
        (a.isStale ? 1 : 0) +
        a.gaps.length +
        a.overlaps.length +
        a.balanceBreaks.length +
        a.missingPeriod.length +
        a.reconciliation.length,
      0
    ) +
    unlinked.length +
    (lowConfidence.count > 0 ? 1 : 0)

  return {
    dataThrough,
    latestData,
    issueCount,
    accounts: coverage,
    unlinkedCardPayments: {
      count: unlinked.length,
      total: unlinked.reduce((s, t) => s + t.amount, 0),
      items: unlinked,
    },
    lowConfidence,
    bridge,
  }
}

interface BridgeInput {
  accounts: Array<{ id: string; name: string }>
  kindById: Map<string, AccountKind>
  statementsByAccount: Map<string, StatementLite[]>
  txnsByAccount: Map<string, TxnLite[]>
  startDate: string
  endDate: string
}

/**
 * Change in net cash (banks minus cards) over the range vs what income - expenses - invested explains
 */
async function buildBridge(
  userId: string,
  profileId: string | undefined,
  input: BridgeInput
): Promise<CashBridge> {
  const { startDate, endDate } = input
  const dayBefore = addDays(startDate, -1)

  const rows: BridgeAccountDelta[] = input.accounts.map((account) => {
    const kind = input.kindById.get(account.id)!
    const statements = input.statementsByAccount.get(account.id) ?? []
    const txns = input.txnsByAccount.get(account.id) ?? []
    const balanceBefore = computeBalanceAt(kind, statements, txns, dayBefore)
    const balanceAfter = computeBalanceAt(kind, statements, txns, endDate)
    return {
      accountId: account.id,
      accountName: account.name,
      kind,
      balanceBefore,
      balanceAfter,
      delta: balanceBefore === null || balanceAfter === null ? null : balanceAfter - balanceBefore,
    }
  })

  const missing = rows.filter((r) => r.delta === null)
  const cashFlow = await getCashFlow(userId, { profileId, startDate, endDate })
  const explained = cashFlow.income - cashFlow.expenses - cashFlow.invested
  const base = {
    startDate,
    endDate,
    accounts: rows,
    missingAccounts: missing.map((r) => ({ accountId: r.accountId, accountName: r.accountName })),
    income: cashFlow.income,
    expenses: cashFlow.expenses,
    invested: cashFlow.invested,
    explained,
  }

  if (missing.length > 0 || startDate > endDate) {
    return { ...base, status: 'insufficient', netChange: null, residual: null }
  }
  const netChange = rows.reduce((sum, r) => sum + (r.kind === 'bank' ? r.delta! : -r.delta!), 0)
  return { ...base, status: 'ok', netChange, residual: netChange - explained }
}
