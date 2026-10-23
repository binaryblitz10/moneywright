/**
 * Settings section navigation - a left rail on desktop, a scrolling tab strip on mobile
 */

import { Database, ListChecks, Palette, Sparkles, UserRound, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export const SETTINGS_SECTIONS = ['general', 'data', 'rules', 'ai', 'appearance'] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

const SECTION_LABELS: Record<SettingsSection, string> = {
  general: 'General',
  data: 'Data',
  rules: 'Rules',
  ai: 'AI Providers',
  appearance: 'Appearance',
}

const SECTION_ICONS: Record<SettingsSection, LucideIcon> = {
  general: UserRound,
  data: Database,
  rules: ListChecks,
  ai: Sparkles,
  appearance: Palette,
}

interface SettingsNavProps {
  active: SettingsSection
  onChange: (section: SettingsSection) => void
}

export function SettingsNav({ active, onChange }: SettingsNavProps) {
  return (
    <nav
      aria-label="Settings sections"
      className="flex gap-1 overflow-x-auto border-b border-border-subtle bg-muted/30 p-2 md:w-52 md:shrink-0 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:p-3"
    >
      {SETTINGS_SECTIONS.map((section) => {
        const Icon = SECTION_ICONS[section]
        return (
          <button
            key={section}
            type="button"
            onClick={() => onChange(section)}
            aria-current={active === section ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary',
              active === section
                ? 'bg-primary/10 font-medium text-primary'
                : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {SECTION_LABELS[section]}
          </button>
        )
      })}
    </nav>
  )
}
