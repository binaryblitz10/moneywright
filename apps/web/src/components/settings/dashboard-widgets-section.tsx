/**
 * Dashboard widgets section: switch each dashboard card or section on or off
 */

import { LayoutGrid, PanelsTopLeft, type LucideIcon } from 'lucide-react'
import { SectionCard } from '@/components/ui/section-card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useDashboardWidgets } from '@/hooks'
import { DASHBOARD_WIDGETS, DASHBOARD_WIDGET_GROUPS } from '@/lib/dashboard-widgets'

const GROUP_ICONS: Record<(typeof DASHBOARD_WIDGET_GROUPS)[number]['id'], LucideIcon> = {
  cards: LayoutGrid,
  sections: PanelsTopLeft,
}

export function DashboardWidgetsSection() {
  const { isVisible, setVisible, isLoading } = useDashboardWidgets()

  if (isLoading) return null

  return (
    <SectionCard title="Dashboard Widgets" description="Choose what the dashboard shows.">
      <div className="grid gap-4 lg:grid-cols-2">
        {DASHBOARD_WIDGET_GROUPS.map((group) => {
          const widgets = DASHBOARD_WIDGETS.filter((w) => w.group === group.id)
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
                {widgets.map((widget) => {
                  const switchId = `dashboard-widget-${widget.id}`
                  return (
                    <div
                      key={widget.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-primary/5"
                    >
                      <Label
                        htmlFor={switchId}
                        className="flex-1 cursor-pointer text-sm font-normal"
                      >
                        {widget.label}
                      </Label>
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
