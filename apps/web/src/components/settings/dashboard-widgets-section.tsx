/**
 * Dashboard widgets section: switch each dashboard card or section on or off
 */

import { SectionCard } from '@/components/ui/section-card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useDashboardWidgets } from '@/hooks'
import { DASHBOARD_WIDGETS, DASHBOARD_WIDGET_GROUPS } from '@/lib/dashboard-widgets'

export function DashboardWidgetsSection() {
  const { isVisible, setVisible, isLoading } = useDashboardWidgets()

  if (isLoading) return null

  return (
    <SectionCard title="Dashboard Widgets" description="Choose what the dashboard shows.">
      <div className="grid gap-x-16 gap-y-4 sm:grid-cols-2">
        {DASHBOARD_WIDGET_GROUPS.map((group) => (
          <div key={group.id} className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
            {DASHBOARD_WIDGETS.filter((w) => w.group === group.id).map((widget) => {
              const switchId = `dashboard-widget-${widget.id}`
              return (
                <div key={widget.id} className="flex items-center justify-between gap-3 py-1">
                  <Label htmlFor={switchId} className="text-sm font-normal cursor-pointer">
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
        ))}
      </div>
    </SectionCard>
  )
}
