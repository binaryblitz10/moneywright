/**
 * Dashboard widgets section: switch each dashboard card or section on or off and reorder them
 */

import { useState } from 'react'
import { Reorder, useDragControls } from 'motion/react'
import { ChevronDown, ChevronUp, GripVertical, LayoutGrid, PanelsTopLeft } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SectionCard } from '@/components/ui/section-card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useDashboardWidgets } from '@/hooks'
import {
  DASHBOARD_WIDGETS,
  DASHBOARD_WIDGET_GROUPS,
  HALF_WIDTH_SECTIONS,
  isCardWidget,
  type DashboardWidgetId,
} from '@/lib/dashboard-widgets'
import { cn } from '@/lib/utils'

type WidgetGroupId = (typeof DASHBOARD_WIDGET_GROUPS)[number]['id']
type WidgetDefinition = (typeof DASHBOARD_WIDGETS)[number]

const GROUP_ICONS: Record<WidgetGroupId, LucideIcon> = {
  cards: LayoutGrid,
  sections: PanelsTopLeft,
}

interface WidgetRowProps {
  widget: WidgetDefinition
  visible: boolean
  isFullWidth: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onVisibleChange: (visible: boolean) => void
  onFullWidthChange: (full: boolean) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDragEnd: () => void
}

/** One draggable row; only the grip starts a drag, so the switch and buttons stay clickable */
function WidgetRow({
  widget,
  visible,
  isFullWidth,
  canMoveUp,
  canMoveDown,
  onVisibleChange,
  onFullWidthChange,
  onMoveUp,
  onMoveDown,
  onDragEnd,
}: WidgetRowProps) {
  const controls = useDragControls()
  const [dragging, setDragging] = useState(false)
  const switchId = `dashboard-widget-${widget.id}`

  return (
    <Reorder.Item
      value={widget.id}
      dragListener={false}
      dragControls={controls}
      onDragStart={() => setDragging(true)}
      onDragEnd={() => {
        setDragging(false)
        onDragEnd()
      }}
      className={cn(
        'relative flex select-none items-center gap-2 px-3 py-2.5 transition-colors hover:bg-primary/5',
        dragging && 'z-10 bg-card shadow-lg hover:bg-card'
      )}
    >
      <div
        className="cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={(e) => controls.start(e)}
        aria-hidden
      >
        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/60" />
      </div>
      <Label htmlFor={switchId} className="flex-1 cursor-pointer text-sm font-normal">
        {widget.label}
      </Label>
      {!isCardWidget(widget.id) && HALF_WIDTH_SECTIONS.has(widget.id) && (
        <Button
          variant={isFullWidth ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 px-2 text-xs"
          aria-pressed={isFullWidth}
          title="Auto shares a row with a neighbour; Full width always gets its own row"
          onClick={() => onFullWidthChange(!isFullWidth)}
        >
          {isFullWidth ? 'Full width' : 'Auto'}
        </Button>
      )}
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={`Move ${widget.label} up`}
          disabled={!canMoveUp}
          onClick={onMoveUp}
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={`Move ${widget.label} down`}
          disabled={!canMoveDown}
          onClick={onMoveDown}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>
      <Switch id={switchId} checked={visible} onCheckedChange={onVisibleChange} />
    </Reorder.Item>
  )
}

export function DashboardWidgetsSection() {
  const { isVisible, setVisible, fullWidth, setFullWidth, order, reorder, setOrder, isLoading } =
    useDashboardWidgets()
  // Order of the group being dragged: kept locally so rows slide as the grip moves, and saved
  // once on drop instead of on every swap
  const [draft, setDraft] = useState<{ group: WidgetGroupId; ids: DashboardWidgetId[] } | null>(
    null
  )

  if (isLoading) return null

  /** Put the dragged group's new order back into the complete widget order */
  const saveDraft = () => {
    if (!draft) return
    const groupIds = new Set<DashboardWidgetId>(draft.ids)
    const queue = [...draft.ids]
    setOrder(order.map((id) => (groupIds.has(id) ? queue.shift()! : id)))
    setDraft(null)
  }

  return (
    <SectionCard
      title="Dashboard Widgets"
      description="Choose what the dashboard shows, drag to change the order, and give a section its own row with the full-width button. Sections left alone in a row fill it automatically."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {DASHBOARD_WIDGET_GROUPS.map((group) => {
          const savedIds = order.filter(
            (id) => DASHBOARD_WIDGETS.find((w) => w.id === id)?.group === group.id
          )
          const ids = draft?.group === group.id ? draft.ids : savedIds
          const widgets = ids
            .map((id) => DASHBOARD_WIDGETS.find((w) => w.id === id))
            .filter((w) => w !== undefined)
          const shown = widgets.filter((w) => isVisible(w.id)).length
          const GroupIcon = GROUP_ICONS[group.id]
          return (
            <div
              key={group.id}
              className="overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated/40"
            >
              <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
                <GroupIcon className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">{group.label}</p>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {shown} of {widgets.length} shown
                </span>
              </div>
              <Reorder.Group
                axis="y"
                values={ids}
                onReorder={(next) => setDraft({ group: group.id, ids: next })}
                className="divide-y divide-border-subtle"
              >
                {widgets.map((widget, index) => (
                  <WidgetRow
                    key={widget.id}
                    widget={widget}
                    visible={isVisible(widget.id)}
                    isFullWidth={fullWidth.has(widget.id)}
                    canMoveUp={index > 0}
                    canMoveDown={index < widgets.length - 1}
                    onVisibleChange={(visible) => setVisible(widget.id, visible)}
                    onFullWidthChange={(full) => setFullWidth(widget.id, full)}
                    onMoveUp={() => reorder(widget.id, widgets[index - 1]!.id)}
                    onMoveDown={() => reorder(widget.id, widgets[index + 1]!.id)}
                    onDragEnd={saveDraft}
                  />
                ))}
              </Reorder.Group>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}
