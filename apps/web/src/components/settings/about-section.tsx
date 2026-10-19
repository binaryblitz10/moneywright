/**
 * About section component - displays app version and links
 */

import { SectionCard } from '@/components/ui/section-card'
import { Info, Github, Globe, FileText } from 'lucide-react'
import { MetaLabel } from '@/components/ui/meta-label'

// Get app version - returns build-time version or 'dev' in development
function getVersion(): string {
  return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
}

export function AboutSection() {
  return (
    <SectionCard title="About">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-elevated p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-card border border-border-subtle">
            <Info className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <MetaLabel as="p">Version</MetaLabel>
            <p className="truncate text-sm font-medium">v{getVersion()}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-elevated p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-card border border-border-subtle">
            <Github className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <MetaLabel as="p">Source</MetaLabel>
            <a
              href="https://github.com/moneywright/moneywright"
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-sm font-medium text-primary hover:underline"
            >
              GitHub
            </a>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-elevated p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-card border border-border-subtle">
            <Globe className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <MetaLabel as="p">Website</MetaLabel>
            <a
              href="https://moneywright.com"
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-sm font-medium text-primary hover:underline"
            >
              moneywright.com
            </a>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-elevated p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-card border border-border-subtle">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <MetaLabel as="p">Documentation</MetaLabel>
            <a
              href="https://moneywright.com/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-sm font-medium text-primary hover:underline"
            >
              Docs
            </a>
          </div>
        </div>
      </div>
    </SectionCard>
  )
}
