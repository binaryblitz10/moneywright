import { createFileRoute, Outlet } from '@tanstack/react-router'
import { AppLayout } from '@/components/domain/app-layout'

export const Route = createFileRoute('/_app')({
  component: AppShell,
})

function AppShell() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
}
