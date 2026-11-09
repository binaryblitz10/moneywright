/**
 * Income flow tab: a Sankey of where income came from (left), the pool it forms (middle)
 * and where it went (right): expense categories, investments and what was left over.
 * Laid out by hand (not a chart library) so every node keeps room for its label.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Info } from 'lucide-react'
import { InlineEmptyState } from '@/components/ui/empty-state'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { formatCurrency } from '@/components/dashboard/utils'
import { getCategoryFillColor } from '@/lib/category-colors'
import type { PeriodReport, ReportComparedRow } from '@/lib/api'
import { ReportCard } from './report-card'
import { formatRange } from './report-utils'

/** Most categories shown per side; the rest are grouped */
const MAX_PER_SIDE = 8
/** Categories under this share of the total are grouped even when there is room */
const MIN_SHARE = 0.02

/** Chart height when nothing needs more room */
const BASE_HEIGHT = 560
const PAD_Y = 24
/** Room kept for every node's two label lines, however small the node is */
const SLOT_MIN = 48
const SLOT_GAP = 8
const MIN_NODE_HEIGHT = 4
const NODE_WIDTH = 10
const LABEL_GUTTER_LEFT = 200
const LABEL_GUTTER_RIGHT = 220
/** Room the info icon takes beside a label */
const HINT_SPACE = 20
const HINT_CLOSE_DELAY_MS = 150
/** Narrower than this the chart scrolls sideways instead of squashing */
const MIN_WIDTH = 820

type Column = 'source' | 'target'

interface Entry {
  label: string
  value: number
  color: string
  /** Category codes behind the node; empty when it has no transactions to open */
  categories: string[]
  /** Short explanation, shown from an info icon beside the label */
  hint?: string
}

interface FlowData {
  sources: Entry[]
  targets: Entry[]
  total: number
}

interface PlacedNode extends Entry {
  /** Share of the total, as a fraction */
  share: number
  x: number
  y: number
  height: number
  /** Where the node's band meets the Income bar */
  poolY: number
  poolHeight: number
}

interface Layout {
  height: number
  pool: { x: number; y: number; height: number }
  sources: PlacedNode[]
  targets: PlacedNode[]
}

/** The largest entries; the long tail becomes one grouped entry */
function limitEntries(entries: Entry[], total: number, otherLabel: string): Entry[] {
  const sorted = [...entries].sort((a, b) => b.value - a.value)
  const kept = sorted.filter((e, i) => i < MAX_PER_SIDE && e.value / total >= MIN_SHARE)
  const rest = sorted.slice(kept.length)
  // A single leftover is shown as itself
  if (rest.length === 1) return [...kept, rest[0]!]
  const restTotal = rest.reduce((sum, e) => sum + e.value, 0)
  return restTotal > 0
    ? [
        ...kept,
        {
          label: otherLabel,
          value: restTotal,
          color: getCategoryFillColor('zinc'),
          categories: rest.flatMap((e) => e.categories),
          hint: `Includes ${rest.map((e) => e.label).join(', ')}.`,
        },
      ]
    : kept
}

function toEntries(rows: ReportComparedRow[], getCategoryColor: (code: string) => string): Entry[] {
  return rows
    .filter((r) => r.current > 0)
    .map((r) => ({
      label: r.label,
      value: r.current,
      color: getCategoryFillColor(getCategoryColor(r.key)),
      categories: [r.key],
    }))
}

/** Pure calculation: both sides of the flow, balanced so everything flowing in flows out */
function buildFlow(
  report: Pick<PeriodReport, 'incomeCategories' | 'expenseCategories' | 'investmentCategories'>,
  getCategoryColor: (code: string) => string
): FlowData | null {
  const incomeEntries = toEntries(report.incomeCategories, getCategoryColor)
  const spending = toEntries(report.expenseCategories, getCategoryColor)
  const investments = report.investmentCategories.filter((r) => r.current > 0)
  const invested = investments.reduce((sum, r) => sum + r.current, 0)
  const spent = spending.reduce((sum, e) => sum + e.value, 0)

  const income = incomeEntries.reduce((sum, e) => sum + e.value, 0)
  const outflow = spent + invested
  if (income <= 0 && outflow <= 0) return null

  // Outflow beyond income is drawn as a source, so both sides add up
  const shortfall = Math.max(outflow - income, 0)
  const surplus = Math.max(income - outflow, 0)
  const total = income + shortfall

  const sources = limitEntries(incomeEntries, total, 'Other income')
  if (shortfall > 0) {
    sources.push({
      label: 'Shortfall',
      value: shortfall,
      color: getCategoryFillColor('red'),
      categories: [],
      hint: 'Spending and investing exceeded your income.',
    })
  }
  const targets = limitEntries(spending, total, 'Other expenses')
  if (invested > 0) {
    targets.push({
      label: 'Invested',
      value: invested,
      color: getCategoryFillColor('blue'),
      categories: investments.map((r) => r.key),
    })
  }
  if (surplus > 0) {
    targets.push({
      label: 'Surplus',
      value: surplus,
      color: getCategoryFillColor('emerald'),
      categories: [],
      hint: 'Income left after spending and investing.',
    })
  }
  return { sources, targets, total }
}

/** Positions for a width: nodes sized by value, but never closer than their labels need */
function layoutFlow(flow: FlowData, width: number): Layout {
  const { total } = flow
  const gaps = (Math.max(flow.sources.length, flow.targets.length) - 1) * SLOT_GAP
  const scale = (BASE_HEIGHT - 2 * PAD_Y - gaps) / total

  const slotsOf = (entries: Entry[]) => entries.map((e) => Math.max(e.value * scale, SLOT_MIN))
  const columnHeight = (slots: number[]) =>
    slots.reduce((sum, s) => sum + s, 0) + (slots.length - 1) * SLOT_GAP
  const sourceSlots = slotsOf(flow.sources)
  const targetSlots = slotsOf(flow.targets)
  const height =
    Math.max(BASE_HEIGHT, columnHeight(sourceSlots), columnHeight(targetSlots)) + 2 * PAD_Y

  const poolHeight = total * scale
  const poolY = (height - poolHeight) / 2
  const sourceX = LABEL_GUTTER_LEFT
  const targetX = width - LABEL_GUTTER_RIGHT - NODE_WIDTH
  const poolX = (sourceX + targetX) / 2

  const place = (entries: Entry[], slots: number[], x: number): PlacedNode[] => {
    let y = (height - columnHeight(slots)) / 2
    let poolOffset = poolY
    return entries.map((entry, i) => {
      const slot = slots[i]!
      const nodeHeight = Math.max(entry.value * scale, MIN_NODE_HEIGHT)
      const node: PlacedNode = {
        ...entry,
        share: entry.value / total,
        x,
        y: y + (slot - nodeHeight) / 2,
        height: nodeHeight,
        poolY: poolOffset,
        poolHeight: nodeHeight,
      }
      y += slot + SLOT_GAP
      poolOffset += entry.value * scale
      return node
    })
  }

  return {
    height,
    pool: { x: poolX, y: poolY, height: poolHeight },
    sources: place(flow.sources, sourceSlots, sourceX),
    targets: place(flow.targets, targetSlots, targetX),
  }
}

/** A band between a node and its part of the Income bar */
function ribbonPath(node: PlacedNode, column: Column, poolX: number): string {
  const toPool = column === 'source'
  const fromX = toPool ? node.x + NODE_WIDTH : poolX + NODE_WIDTH
  const toX = toPool ? poolX : node.x
  const fromTop = toPool ? node.y : node.poolY
  const fromBottom = toPool ? node.y + node.height : node.poolY + node.poolHeight
  const toTop = toPool ? node.poolY : node.y
  const toBottom = toPool ? node.poolY + node.poolHeight : node.y + node.height
  const mid = (fromX + toX) / 2
  return (
    `M${fromX},${fromTop} C${mid},${fromTop} ${mid},${toTop} ${toX},${toTop} ` +
    `L${toX},${toBottom} C${mid},${toBottom} ${mid},${fromBottom} ${fromX},${fromBottom} Z`
  )
}

/** Width of an element, kept up to date as it resizes */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}

interface NodeHintProps {
  text: string
  label: string
  /** Centre of the icon */
  x: number
  y: number
}

/** Info icon that opens a short explanation on hover or focus, like the one in the edit dialog */
function NodeHint({ text, label, x, y }: NodeHintProps) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const show = () => {
    clearTimeout(closeTimer.current)
    setOpen(true)
  }
  const hideSoon = () => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), HINT_CLOSE_DELAY_MS)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <g
          role="button"
          tabIndex={0}
          aria-label={`About ${label}`}
          className="cursor-help text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground"
          onMouseEnter={show}
          onMouseLeave={hideSoon}
          onFocus={show}
          onBlur={hideSoon}
          onKeyDown={(e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)}
        >
          {/* Larger invisible target so the small icon is easy to hover */}
          <circle cx={x} cy={y} r={10} fill="transparent" />
          <Info x={x - 7} y={y - 7} width={14} height={14} />
        </g>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-64 p-3 text-sm"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
      >
        {text}
      </PopoverContent>
    </Popover>
  )
}

interface IncomeFlowViewProps {
  report: PeriodReport
  getCategoryColor: (code: string) => string
}

export function IncomeFlowView({ report, getCategoryColor }: IncomeFlowViewProps) {
  const { currency } = report
  const navigate = useNavigate()
  const flow = useMemo(() => buildFlow(report, getCategoryColor), [report, getCategoryColor])
  const { ref, width: measured } = useElementWidth<HTMLDivElement>()
  const [hovered, setHovered] = useState<string | null>(null)

  const width = Math.max(measured, MIN_WIDTH)
  const layout = useMemo(() => (flow ? layoutFlow(flow, width) : null), [flow, width])

  if (!flow || !layout) {
    return (
      <InlineEmptyState
        icon={Info}
        title="No income or spending in this period"
        description="Pick another period, or upload statements that cover it."
      />
    )
  }

  const money = (value: number) => formatCurrency(value, currency)
  const percent = (share: number) => `${(share * 100).toFixed(1)}%`
  const opacityOf = (id: string) => (hovered === null ? 0.28 : hovered === id ? 0.55 : 0.08)

  const openTransactions = (node: PlacedNode) =>
    navigate({
      to: '/transactions',
      search: {
        category: node.categories.join(','),
        startDate: report.period.startDate,
        endDate: report.period.endDate,
      },
    })

  const renderNode = (node: PlacedNode, column: Column) => {
    const id = `${column}:${node.label}`
    const clickable = node.categories.length > 0
    const tooltip = [
      `${node.label}: ${money(node.value)} (${percent(node.share)})`,
      clickable ? 'Click to see the transactions' : undefined,
    ]
      .filter(Boolean)
      .join('\n')
    const edgeX = column === 'source' ? node.x - 12 : node.x + NODE_WIDTH + 12
    const hintSpace = node.hint ? HINT_SPACE : 0
    const labelX = column === 'source' ? edgeX - hintSpace : edgeX + hintSpace
    const hintX = column === 'source' ? edgeX - 7 : edgeX + 7
    const anchor = column === 'source' ? 'end' : 'start'
    const centerY = node.y + node.height / 2
    return (
      <g
        key={id}
        onMouseEnter={() => setHovered(id)}
        onMouseLeave={() => setHovered(null)}
        className={clickable ? 'cursor-pointer outline-none' : 'cursor-default'}
        {...(clickable && {
          role: 'link',
          tabIndex: 0,
          'aria-label': `${node.label}, ${money(node.value)}. Open transactions`,
          onClick: () => openTransactions(node),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') openTransactions(node)
          },
        })}
      >
        <path
          d={ribbonPath(node, column, layout.pool.x)}
          fill={node.color}
          fillOpacity={opacityOf(id)}
          className="transition-[fill-opacity]"
        >
          <title>{tooltip}</title>
        </path>
        <rect
          x={node.x}
          y={node.y}
          width={NODE_WIDTH}
          height={node.height}
          rx={2}
          fill={node.color}
        />
        <text
          x={labelX}
          y={centerY - 3}
          textAnchor={anchor}
          className="fill-foreground text-[13px] font-medium"
        >
          {node.label}
        </text>
        <text
          x={labelX}
          y={centerY + 14}
          textAnchor={anchor}
          className="fill-muted-foreground text-xs tabular-nums"
        >
          {money(node.value)}
          <tspan dx={8} className="fill-muted-foreground/70">
            {percent(node.share)}
          </tspan>
        </text>
        {node.hint && <NodeHint text={node.hint} label={node.label} x={hintX} y={centerY} />}
      </g>
    )
  }

  return (
    <ReportCard title="Income Breakdown" description={formatRange(report.period)}>
      <div className="mb-2 space-y-1 px-2 sm:px-0">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Total income</div>
        <div className="text-3xl font-semibold tabular-nums text-primary">
          {money(report.totals.current.income)}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div ref={ref} style={{ minWidth: MIN_WIDTH }}>
          <svg
            width={width}
            height={layout.height}
            viewBox={`0 0 ${width} ${layout.height}`}
            role="img"
            aria-label="Income flow: where income came from and where it went"
          >
            {layout.sources.map((node) => renderNode(node, 'source'))}
            {layout.targets.map((node) => renderNode(node, 'target'))}
            <rect
              x={layout.pool.x}
              y={layout.pool.y}
              width={NODE_WIDTH}
              height={layout.pool.height}
              rx={2}
              fill={getCategoryFillColor('slate')}
            />
            <text
              x={layout.pool.x + NODE_WIDTH / 2}
              y={layout.pool.y - 10}
              textAnchor="middle"
              className="fill-muted-foreground text-xs font-medium"
            >
              Income
            </text>
          </svg>
        </div>
      </div>
    </ReportCard>
  )
}
