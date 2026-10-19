import {
  INVESTMENT_HOLDING_TYPES,
  INVESTMENT_SOURCE_TYPES,
  INVESTMENT_TYPES,
} from '../../lib/constants'
import { logger } from '../../lib/logger'
import { getConversionRate } from '../fx-rates'
import { getHoldingsByUserId } from '../investment-holdings'
import { getSourcesByUserId, type InvestmentSourceResponse } from '../investment-sources'
import { merchantKey, merchantName } from '../spending-changes'
import {
  changeBetween,
  getReportBounds,
  inRange,
  loadReportTransactions,
  resolvePeriod,
  type Change,
  type ReportPeriod,
  type ReportTransaction,
} from './shared'

/**
 * Investments report
 * Money put into and taken out of investments (investment-kind transactions) in the
 * period, split per platform where the payment names one of the user's investment sources,
 * next to what those platforms hold today.
 */

/** Source types too generic to recognise a payment by */
const GENERIC_SOURCE_TYPES = new Set(['manual', 'other'])
/** Names too generic to recognise a payment by */
const GENERIC_NAMES = new Set(['other', 'manual', 'manual entry'])

const SOURCE_TYPE_LABELS = new Map<string, string>(
  [...INVESTMENT_SOURCE_TYPES.IN, ...INVESTMENT_SOURCE_TYPES.US].map(
    (t) => [t.code, t.label] as const
  )
)

const HOLDING_TYPE_LABELS = new Map<string, string>(
  [...INVESTMENT_HOLDING_TYPES, ...INVESTMENT_TYPES.IN, ...INVESTMENT_TYPES.US].map(
    (t) => [t.code, t.label] as const
  )
)

export function holdingTypeLabel(code: string): string {
  return HOLDING_TYPE_LABELS.get(code) ?? code.replace(/_/g, ' ')
}

/** A holding with its values already converted to the display currency */
export interface ReportHolding {
  sourceId: string | null
  investmentType: string
  currentValue: number
  /** Null when the cost isn't known */
  investedValue: number | null
  asOfDate: string
}

export type ReportSource = Pick<
  InvestmentSourceResponse,
  'id' | 'sourceType' | 'sourceName' | 'institution'
>

export interface InvestmentFlow {
  /** Debits */
  putIn: number
  /** Credits */
  takenOut: number
  /** putIn - takenOut */
  net: number
  /** Transactions */
  count: number
}

export interface InvestmentMonth {
  month: string
  putIn: number
  takenOut: number
  net: number
}

export interface PlatformRow {
  sourceId: string
  name: string
  /** The platform's name, e.g. "Zerodha" */
  provider: string
  institution: string | null
  putIn: number
  takenOut: number
  /** Put in the comparison period; null without a comparison */
  previousPutIn: number | null
  /** Put in minus taken out over all data */
  netSinceStart: number
  /** The holdings figures are null when the platform has no holdings */
  currentValue: number | null
  cost: number | null
  gain: number | null
  /** Fraction of cost; null without a cost */
  gainPct: number | null
  /** Latest date the holdings are as of */
  asOfDate: string | null
  holdingsCount: number
}

export interface AllocationRow {
  type: string
  label: string
  value: number
  /** Fraction of the total current value */
  share: number
}

export interface InvestmentOverall {
  currentValue: number
  /** Cost of the holdings whose cost is known */
  cost: number
  /** Current value minus cost, for the holdings whose cost is known */
  gain: number
  /** Fraction of cost; null without a cost */
  gainPct: number | null
  holdingsCount: number
}

export interface InvestmentsData {
  totals: {
    current: InvestmentFlow
    previous: InvestmentFlow | null
    putInChange: Change | null
  }
  byMonth: InvestmentMonth[]
  platforms: PlatformRow[]
  /** This period's payments that match no platform; they are still in the totals */
  unmatched: { putIn: number; takenOut: number; count: number }
  allocation: AllocationRow[]
  overall: InvestmentOverall
}

export interface InvestmentsResponse extends InvestmentsData {
  period: ReportPeriod
  currency: string
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Names a payment to this source may carry: platform name, source name and institution */
function sourceNames(source: ReportSource): string[] {
  const names: string[] = []
  if (!GENERIC_SOURCE_TYPES.has(source.sourceType)) {
    const label = SOURCE_TYPE_LABELS.get(source.sourceType)
    if (label) names.push(label)
  }
  names.push(source.sourceName)
  if (source.institution) names.push(source.institution)
  return names
    .map((n) => n.trim())
    .filter((n) => n.length >= 3 && !GENERIC_NAMES.has(n.toLowerCase()))
}

/** Whether `text` contains `name` as a whole word, case-insensitive */
export function containsWord(text: string, name: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(name)}([^a-z0-9]|$)`, 'i').test(text)
}

/** The first source whose platform name appears in one of the texts; null when none does */
export function matchSource(texts: string[], sources: ReportSource[]): ReportSource | null {
  for (const source of sources) {
    const names = sourceNames(source)
    if (texts.some((text) => names.some((name) => containsWord(text, name)))) return source
  }
  return null
}

function flowOf(transactions: ReportTransaction[]): InvestmentFlow {
  const flow: InvestmentFlow = { putIn: 0, takenOut: 0, net: 0, count: transactions.length }
  for (const txn of transactions) {
    if (txn.type === 'debit') flow.putIn += txn.amount
    else flow.takenOut += txn.amount
  }
  flow.net = flow.putIn - flow.takenOut
  return flow
}

interface Holdings {
  currentValue: number
  cost: number
  gain: number
  count: number
  asOfDate: string | null
}

function summariseHoldings(holdings: ReportHolding[]): Holdings {
  let currentValue = 0
  let cost = 0
  let currentWithCost = 0
  let asOfDate: string | null = null
  for (const h of holdings) {
    currentValue += h.currentValue
    if (h.investedValue !== null && h.investedValue > 0) {
      cost += h.investedValue
      currentWithCost += h.currentValue
    }
    if (!asOfDate || h.asOfDate > asOfDate) asOfDate = h.asOfDate
  }
  return { currentValue, cost, gain: currentWithCost - cost, count: holdings.length, asOfDate }
}

/**
 * Pure calculation - no DB access (unit tested)
 * `transactions` are the investment-kind transactions over ALL data (net put in since the
 * start needs them); the period and comparison are cut out of them by date. Payments are
 * grouped by merchant and each group is matched to a source by name.
 */
export function computeInvestments(input: {
  transactions: ReportTransaction[]
  period: ReportPeriod
  sources: ReportSource[]
  holdings: ReportHolding[]
}): InvestmentsData {
  const { period } = input
  const all = input.transactions
  const current = inRange(all, period)
  const previous = period.comparison ? inRange(all, period.comparison) : null

  const currentFlow = flowOf(current)
  const previousFlow = previous ? flowOf(previous) : null

  const byMonth = period.months.map<InvestmentMonth>((month) => {
    const flow = flowOf(current.filter((t) => t.date.startsWith(month)))
    return { month, putIn: flow.putIn, takenOut: flow.takenOut, net: flow.net }
  })

  // Group all payments by merchant and match each group to a source
  const groups = new Map<string, { texts: string[]; transactions: ReportTransaction[] }>()
  for (const txn of all) {
    const key = merchantKey(txn)
    let group = groups.get(key)
    if (!group) {
      group = {
        texts: [merchantName(txn), txn.summary ?? '', txn.originalDescription],
        transactions: [],
      }
      groups.set(key, group)
    }
    group.transactions.push(txn)
  }
  const bySource = new Map<string, ReportTransaction[]>()
  const unmatched: ReportTransaction[] = []
  for (const group of groups.values()) {
    const source = matchSource(group.texts, input.sources)
    if (source) bySource.set(source.id, [...(bySource.get(source.id) ?? []), ...group.transactions])
    else unmatched.push(...group.transactions)
  }

  const platforms: PlatformRow[] = []
  for (const source of input.sources) {
    const sourceTxns = bySource.get(source.id) ?? []
    const sourceHoldings = input.holdings.filter((h) => h.sourceId === source.id)
    if (sourceTxns.length === 0 && sourceHoldings.length === 0) continue
    const flow = flowOf(inRange(sourceTxns, period))
    const held = sourceHoldings.length > 0 ? summariseHoldings(sourceHoldings) : null
    platforms.push({
      sourceId: source.id,
      name: source.sourceName,
      provider: SOURCE_TYPE_LABELS.get(source.sourceType) ?? source.sourceName,
      institution: source.institution,
      putIn: flow.putIn,
      takenOut: flow.takenOut,
      previousPutIn: period.comparison
        ? flowOf(inRange(sourceTxns, period.comparison)).putIn
        : null,
      netSinceStart: flowOf(sourceTxns).net,
      currentValue: held?.currentValue ?? null,
      cost: held && held.cost > 0 ? held.cost : null,
      gain: held && held.cost > 0 ? held.gain : null,
      gainPct: held && held.cost > 0 ? held.gain / held.cost : null,
      asOfDate: held?.asOfDate ?? null,
      holdingsCount: held?.count ?? 0,
    })
  }
  platforms.sort((a, b) => b.putIn - a.putIn || (b.currentValue ?? 0) - (a.currentValue ?? 0))

  const unmatchedFlow = flowOf(inRange(unmatched, period))

  const overall = summariseHoldings(input.holdings)
  const byType = new Map<string, number>()
  for (const h of input.holdings) {
    byType.set(h.investmentType, (byType.get(h.investmentType) ?? 0) + h.currentValue)
  }
  const allocation = [...byType]
    .map<AllocationRow>(([type, value]) => ({
      type,
      label: holdingTypeLabel(type),
      value,
      share: overall.currentValue > 0 ? value / overall.currentValue : 0,
    }))
    .sort((a, b) => b.value - a.value)

  return {
    totals: {
      current: currentFlow,
      previous: previousFlow,
      putInChange: previousFlow ? changeBetween(previousFlow.putIn, currentFlow.putIn) : null,
    },
    byMonth,
    platforms,
    unmatched: {
      putIn: unmatchedFlow.putIn,
      takenOut: unmatchedFlow.takenOut,
      count: unmatchedFlow.count,
    },
    allocation,
    overall: {
      currentValue: overall.currentValue,
      cost: overall.cost,
      gain: overall.gain,
      gainPct: overall.cost > 0 ? overall.gain / overall.cost : null,
      holdingsCount: overall.count,
    },
  }
}

/** Holdings with their values converted to INR, the currency of every other report figure */
async function loadHoldings(userId: string, profileId?: string): Promise<ReportHolding[]> {
  const holdings = await getHoldingsByUserId(userId, { profileId })
  const rates = new Map<string, number>()
  for (const currency of new Set(holdings.map((h) => h.currency.toUpperCase()))) {
    try {
      rates.set(currency, await getConversionRate(currency, 'INR'))
    } catch {
      logger.warn(`[Reports] No exchange rate for ${currency}, using 1:1`)
      rates.set(currency, 1)
    }
  }
  return holdings.map((h) => {
    const rate = rates.get(h.currency.toUpperCase()) ?? 1
    return {
      sourceId: h.sourceId,
      investmentType: h.investmentType,
      currentValue: h.currentValue * rate,
      investedValue: h.investedValue === null ? null : h.investedValue * rate,
      asOfDate: h.asOfDate,
    }
  })
}

/**
 * Investments report for a range of complete months
 */
export async function getInvestmentsReport(
  userId: string,
  options: { profileId?: string; from: string; to: string }
): Promise<InvestmentsResponse> {
  const { profileId } = options
  const bounds = await getReportBounds(userId, profileId)
  const period = resolvePeriod(options.from, options.to, bounds.earliestMonth)

  const [loaded, sources, holdings] = await Promise.all([
    loadReportTransactions(userId, { profileId, kind: 'investment' }),
    getSourcesByUserId(userId, profileId),
    loadHoldings(userId, profileId),
  ])

  return {
    ...computeInvestments({
      transactions: loaded.transactions,
      period,
      sources,
      holdings,
    }),
    period,
    currency: loaded.currency,
  }
}
