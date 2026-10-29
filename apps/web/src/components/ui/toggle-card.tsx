import type { LucideIcon } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

export interface ToggleCardProps {
  id: string
  /** Icon shown before the title */
  icon: LucideIcon
  title: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  className?: string
}

/**
 * ToggleCard - bordered card with an icon, a title, a short description and a switch
 */
export function ToggleCard({
  id,
  icon: Icon,
  title,
  description,
  checked,
  onCheckedChange,
  className,
}: ToggleCardProps) {
  return (
    <div className={cn('flex items-center justify-between gap-6 rounded-lg border p-4', className)}>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor={id} className="font-medium">
            {title}
          </Label>
        </div>
        <p className="text-[13px] text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}
