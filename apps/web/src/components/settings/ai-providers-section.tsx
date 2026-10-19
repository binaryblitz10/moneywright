/**
 * AI Providers section component
 */

import { SectionCard } from '@/components/ui/section-card'
import { ProviderCard } from './provider-card'
import { PROVIDER_ORDER, type LLMSettings, type LLMProviders } from './types'

interface AIProvidersSectionProps {
  settings: LLMSettings | undefined
  providers: LLMProviders | undefined
}

export function AIProvidersSection({ settings, providers }: AIProvidersSectionProps) {
  const configuredCount = providers?.filter((p) => p.isConfigured).length || 0

  return (
    <SectionCard
      title="AI Providers"
      action={
        configuredCount > 0 && (
          <span className="text-xs text-muted-foreground">{configuredCount} configured</span>
        )
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PROVIDER_ORDER.map((code) => (
          <ProviderCard key={code} code={code} settings={settings} providers={providers} />
        ))}
      </div>
    </SectionCard>
  )
}
