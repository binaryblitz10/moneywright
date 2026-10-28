/**
 * Theme Section - Switch between light and dark mode
 */

import { Moon, Sun } from 'lucide-react'
import { SectionCard } from '@/components/ui/section-card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useTheme } from '@/hooks/useTheme'

export function ThemeSection() {
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <SectionCard title="Theme" description="Choose between light and dark mode.">
      <div className="flex items-center justify-between">
        <Label htmlFor="theme-switch" className="flex items-center gap-2 text-sm cursor-pointer">
          {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          Dark mode
        </Label>
        <Switch
          id="theme-switch"
          checked={isDark}
          onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
        />
      </div>
    </SectionCard>
  )
}
