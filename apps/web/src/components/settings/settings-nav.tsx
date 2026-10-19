/**
 * Settings section navigation - a left rail on desktop, a scrolling tab strip on mobile
 */

import { cn } from '@/lib/utils'

export const SETTINGS_SECTIONS = ['general', 'rules', 'ai', 'appearance'] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

const SECTION_LABELS: Record<SettingsSection, string> = {
  general: 'General',
  rules: 'Rules',
  ai: 'AI Providers',
  appearance: 'Appearance',
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
      {SETTINGS_SECTIONS.map((section) => (
        <button
          key={section}
          type="button"
          onClick={() => onChange(section)}
          aria-current={active === section ? 'page' : undefined}
          className={cn(
            'whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary',
            active === section
              ? 'bg-primary/10 font-medium text-primary'
              : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground'
          )}
        >
          {SECTION_LABELS[section]}
        </button>
      ))}
    </nav>
  )
}
