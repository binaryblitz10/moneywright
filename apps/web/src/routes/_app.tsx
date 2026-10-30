import { createFileRoute, Outlet } from '@tanstack/react-router'
import { AppLayout } from '@/components/domain/app-layout'
import { useProfileSelection } from '@/hooks'

export const Route = createFileRoute('/_app')({
  component: AppShell,
})

function AppShell() {
  const { activeProfileId, showFamilyView } = useProfileSelection()

  return (
    <AppLayout>
      {/* Switching profile starts every page fresh: pagination, selections, open chats */}
      <Outlet key={showFamilyView ? 'family' : activeProfileId} />
    </AppLayout>
  )
}
