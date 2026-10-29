import { useCallback, useState } from 'react'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from './app-sidebar'
import { BackButton } from './back-button'
import { CommandPalette } from './command-palette'
import { ShortcutsDialog } from './shortcuts-dialog'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { cn } from '@/lib/utils'
import { isMacDesktop } from '@/lib/desktop'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const showHelp = useCallback(() => setHelpOpen(true), [])

  useKeyboardShortcuts({ disabled: paletteOpen || helpOpen, onShowHelp: showHelp })

  return (
    <SidebarProvider className="h-svh min-h-0">
      <AppSidebar onOpenSearch={() => setPaletteOpen(true)} />
      <SidebarInset className="min-h-0 bg-background">
        {/* Mobile top bar: the sidebar is a sheet below md, so this is the only way to open it */}
        <header
          className={cn(
            'sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border-subtle bg-background/95 backdrop-blur-sm px-4 md:hidden',
            isMacDesktop && 'h-[4.25rem] pt-3'
          )}
        >
          <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
          <img src="/logo.png" alt="" className="h-6 w-6" />
          <span className="text-base font-semibold font-display tracking-tight">Moneywright</span>
        </header>
        <main className="flex-1 overflow-x-auto overflow-y-scroll overscroll-contain p-6 lg:p-8">
          <BackButton />
          {children}
        </main>
      </SidebarInset>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </SidebarProvider>
  )
}
