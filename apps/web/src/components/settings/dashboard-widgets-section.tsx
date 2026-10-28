/**
 * Dashboard widgets section: switch each dashboard card or section on or off and reorder them
 */

import { useState } from 'react'
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
  type DashboardWidgetId,
} from '@/lib/dashboard-widgets'
import { cn } from '@/lib/utils'

const GROUP_ICONS: Record<(typeof DASHBOARD_WIDGET_GROUPS)[number]['id'], LucideIcon> = {
  cards: LayoutGrid,
  sections: PanelsTopLeft,
}

export function DashboardWidgetsSection() {
  const { isVisible, setVisible, order, reorder, isLoading } = useDashboardWidgets()
  const [draggingId, setDraggingId] = useState<DashboardWidgetId | null>(null)
  const [dropTargetId, setDropTargetId] = useState<DashboardWidgetId | null>(null)

  if (isLoading) return null

  const endDrag = () => {
    setDraggingId(null)
    setDropTargetId(null)
  }

  return (
    <SectionCard
      title="Dashboard Widgets"
      description="Choose what the dashboard shows and drag to change the order."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {DASHBOARD_WIDGET_GROUPS.map((group) => {
          const widgets = order
            .map((id) => DASHBOARD_WIDGETS.find((w) => w.id === id))
            .filter((w) => w?.group === group.id)
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
              <div className="divide-y divide-border-subtle">
                {widgets.map((widget, index) => {
                  const switchId = `dashboard-widget-${widget.id}`
                  const previous = widgets[index - 1]
                  const next = widgets[index + 1]
                  const isGroupDrag =
                    draggingId !== null &&
                    DASHBOARD_WIDGETS.find((w) => w.id === draggingId)?.group === group.id
                  return (
                    <div
                      key={widget.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move'
                        setDraggingId(widget.id)
                      }}
                      onDragOver={(e) => {
                        if (!isGroupDrag) return
                        e.preventDefault()
                        setDropTargetId(widget.id)
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        if (isGroupDrag && draggingId) reorder(draggingId, widget.id)
                        endDrag()
                      }}
                      onDragEnd={endDrag}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-primary/5',
                        draggingId === widget.id && 'opacity-50',
                        isGroupDrag &&
                          dropTargetId === widget.id &&
                          draggingId !== widget.id &&
                          'bg-primary/10'
                      )}
                    >
                      <GripVertical
                        className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/60"
                        aria-hidden
                      />
                      <Label
                        htmlFor={switchId}
                        className="flex-1 cursor-pointer text-sm font-normal"
                      >
                        {widget.label}
                      </Label>
                      <div className="flex items-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={`Move ${widget.label} up`}
                          disabled={!previous}
                          onClick={() => previous && reorder(widget.id, previous.id)}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={`Move ${widget.label} down`}
                          disabled={!next}
                          onClick={() => next && reorder(widget.id, next.id)}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                      <Switch
                        id={switchId}
                        checked={isVisible(widget.id)}
                        onCheckedChange={(checked) => setVisible(widget.id, checked)}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}
