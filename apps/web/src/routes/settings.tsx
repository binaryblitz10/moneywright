/**
 * Settings page - Sections for general, rules, AI providers and appearance
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks'
import { getLLMSettings, getLLMProviders, getProfiles, getUserSessions } from '@/lib/api'
import { AppLayout } from '@/components/domain/app-layout'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'

import {
  AIProvidersSection,
  ProfilesSection,
  AccountSection,
  SessionsSection,
  DangerZoneSection,
  AboutSection,
  PinSection,
  CategorizationHintsSection,
  TransactionRulesSection,
  DataHealthSection,
  DashboardWidgetsSection,
  BackupsSection,
  SmsImportSection,
  SettingsNav,
  SETTINGS_SECTIONS,
} from '@/components/settings'

const searchSchema = z.object({
  section: z.enum(SETTINGS_SECTIONS).catch('general'),
})

export const Route = createFileRoute('/settings')({
  validateSearch: searchSchema,
  component: SettingsPage,
})

function SectionSkeleton() {
  return <Skeleton className="h-48 w-full rounded-xl" />
}

function SettingsPage() {
  const { user, logout, authEnabled } = useAuth()
  const { section } = Route.useSearch()
  const navigate = useNavigate({ from: '/settings' })

  // LLM Settings queries
  const { data: llmSettings, isLoading: llmLoading } = useQuery({
    queryKey: ['llm-settings'],
    queryFn: getLLMSettings,
  })

  const { data: providers } = useQuery({
    queryKey: ['llm-providers'],
    queryFn: getLLMProviders,
  })

  // Profiles query
  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ['profiles'],
    queryFn: getProfiles,
  })

  // Sessions query
  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: getUserSessions,
    enabled: authEnabled,
  })

  return (
    <AppLayout>
      <PageHeader
        title="Settings"
        description="Manage your profiles, security, data, rules, AI providers and dashboard"
      />

      <div className="flex max-w-5xl flex-col overflow-hidden rounded-xl border border-border-subtle bg-card shadow-sm md:flex-row">
        <SettingsNav
          active={section}
          onChange={(next) => navigate({ search: { section: next }, replace: true })}
        />

        <div className="min-w-0 flex-1 [&>[data-slot=card]]:rounded-none [&>[data-slot=card]]:border-0 [&>[data-slot=card]]:bg-transparent [&>[data-slot=card]]:shadow-none [&>[data-slot=card]+[data-slot=card]]:border-t [&>[data-slot=card]+[data-slot=card]]:border-border-subtle">
          {section === 'general' && (
            <>
              {profilesLoading ? <SectionSkeleton /> : <ProfilesSection profiles={profiles} />}

              {/* PIN Section - only show when auth is disabled (local mode) */}
              {!authEnabled && <PinSection />}

              {/* Account Section - only show when auth is enabled */}
              {authEnabled && <AccountSection user={user} />}

              {/* Sessions - only show when auth is enabled */}
              {authEnabled && <SessionsSection sessions={sessions} isLoading={sessionsLoading} />}

              <AboutSection />

              {/* Danger Zone - only show when auth is enabled */}
              {authEnabled && <DangerZoneSection onLogout={logout} />}
            </>
          )}

          {section === 'data' && (
            <>
              {/* Data Health - checks across all profiles */}
              <DataHealthSection profileId={undefined} />

              {/* Bank SMS alerts - macOS desktop only */}
              <SmsImportSection />

              {/* Backups - hidden when the database does not support them */}
              <BackupsSection />
            </>
          )}

          {section === 'rules' && (
            <>
              <TransactionRulesSection />
              <CategorizationHintsSection />
            </>
          )}

          {section === 'ai' &&
            (llmLoading ? (
              <SectionSkeleton />
            ) : (
              <AIProvidersSection settings={llmSettings} providers={providers} />
            ))}

          {section === 'appearance' && <DashboardWidgetsSection />}
        </div>
      </div>
    </AppLayout>
  )
}
