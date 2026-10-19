/**
 * Account info section component
 */

import { SectionCard } from '@/components/ui/section-card'
import { User, Mail } from 'lucide-react'
import { MetaLabel } from '@/components/ui/meta-label'

interface AccountSectionProps {
  user: {
    name?: string | null
    email?: string | null
  } | null
}

export function AccountSection({ user }: AccountSectionProps) {
  return (
    <SectionCard title="Account">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-elevated p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-card border border-border-subtle">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <MetaLabel as="p">Name</MetaLabel>
            <p className="truncate text-sm font-medium">{user?.name || 'Local User'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-elevated p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-card border border-border-subtle">
            <Mail className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <MetaLabel as="p">Email</MetaLabel>
            <p className="truncate text-sm font-medium">{user?.email || 'No authentication'}</p>
          </div>
        </div>
      </div>
    </SectionCard>
  )
}
