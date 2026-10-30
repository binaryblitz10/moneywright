import { useRef, useState } from 'react'
import { useNavigate, useLocation } from '@tanstack/react-router'
import { useProfileSelection, useReviewCounts, useSmsImportStatus, useUpdateChecker } from '@/hooks'
import { cn } from '@/lib/utils'
import { isMacDesktop } from '@/lib/desktop'
import { markSidebarNavigation } from '@/lib/back-navigation'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { Download, Search, X } from 'lucide-react'
import { MOD_KEY } from '@/lib/platform'
import { askPennyNavItem, getNavGroups, settingsNavItem, type NavItem } from './nav-items'

interface AppSidebarProps {
  onOpenSearch: () => void
}

export function AppSidebar({ onOpenSearch }: AppSidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  // The pressed item is highlighted straight away and stays so until the location catches up,
  // so the colour never goes back to idle between press, release and the route changing
  const [pressed, setPressed] = useState<{ href: string; from: string } | null>(null)
  const clickedRef = useRef(false)
  const activeHref = pressed?.from === location.pathname ? pressed.href : location.pathname
  const { updateAvailable, isReady, restartToUpdate, dismissUpdate } = useUpdateChecker()

  // Items waiting in the Review queues
  const { activeProfileId } = useProfileSelection()
  const { data: reviewCounts } = useReviewCounts(activeProfileId)
  const reviewTotal = reviewCounts
    ? reviewCounts.duplicateGroups +
      reviewCounts.pending +
      reviewCounts.other +
      reviewCounts.possibleMatches
    : 0

  // Bank Messages only appears once reading bank messages is switched on
  const { data: smsStatus } = useSmsImportStatus()
  const navGroups = getNavGroups(!!smsStatus?.enabled)

  const renderNavItem = (item: NavItem) => {
    const isActive = activeHref === item.href
    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton
          onPointerDown={() => {
            clickedRef.current = false
            setPressed({ href: item.href, from: location.pathname })
          }}
          onPointerLeave={() => {
            if (!clickedRef.current) setPressed(null)
          }}
          onClick={() => {
            clickedRef.current = true
            markSidebarNavigation()
            // Drop the pressed mark once navigation settles, even if the location never moved
            void navigate({ to: item.href, viewTransition: false }).finally(() =>
              setPressed((current) => (current?.href === item.href ? null : current))
            )
          }}
          isActive={isActive}
          className={cn(
            'relative h-8 transition-colors duration-50',
            isActive && 'text-foreground data-[active=true]:font-normal',
            !isActive && 'text-muted-foreground hover:text-foreground hover:bg-surface-hover'
          )}
        >
          {/* Active indicator bar */}
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.75 h-4 rounded-r-full bg-primary" />
          )}
          <item.icon className={cn('h-4 w-4', isActive && 'text-primary')} />
          <span className="text-sm">{item.title}</span>
          {item.href === '/review' && reviewTotal > 0 && (
            <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {reviewTotal > 99 ? '99+' : reviewTotal}
            </span>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return (
    <Sidebar className="border-r border-(--border-subtle)">
      {/* Logo Header */}
      <SidebarHeader className={cn('px-4 py-4', isMacDesktop && 'pt-9')}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-lg rounded-full" />
            <img src="/logo.png" alt="Moneywright" className="relative h-8 w-8" />
          </div>
          <span className="text-lg font-semibold font-display tracking-tight">Moneywright</span>
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label={`Search (${MOD_KEY} K)`}
            title={`Search (${MOD_KEY} K)`}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors cursor-pointer"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </SidebarHeader>

      <SidebarSeparator className="mx-0 w-full bg-(--border-subtle)" />

      <SidebarContent className="px-2 py-2 gap-0">
        {navGroups.map((group, i) => (
          <SidebarGroup key={group.label} className={cn('py-1', i > 0 && 'mt-1')}>
            <SidebarGroupLabel className="h-6 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5" aria-label={group.label}>
                {group.items.map(renderNavItem)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        {/* Ask Penny, pinned above the footer */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">{renderNavItem(askPennyNavItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Update Ready Banner - only shown when update is downloaded and ready for restart */}
      {updateAvailable && isReady && (
        <div className="mx-2 mb-2">
          <div className="group relative overflow-hidden rounded-xl bg-gradient-to-b from-zinc-800/90 to-zinc-900/95 p-3 shadow-lg shadow-black/20 ring-1 ring-white/[0.08] backdrop-blur-sm">
            {/* Subtle shimmer effect on hover */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />

            {/* Accent line at top */}
            <div className="absolute top-0 left-3 right-3 h-px bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent" />

            {/* Dismiss button */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                dismissUpdate()
              }}
              className="absolute top-2 right-2 z-10 p-1 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] active:bg-white/[0.08] transition-all duration-150 cursor-pointer"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            <div className="relative flex items-center gap-3 pr-6">
              {/* Icon */}
              <div className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20">
                <Download className="h-4 w-4 text-emerald-400" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-medium text-zinc-200">Update Ready</p>
                  <span className="px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 rounded">
                    v{updateAvailable.new_version}
                  </span>
                </div>
                <button
                  onClick={restartToUpdate}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-emerald-400 transition-colors duration-200 group/btn cursor-pointer"
                >
                  <span>Restart to install</span>
                  <svg
                    className="h-3 w-3 transition-transform duration-200 group-hover/btn:translate-x-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SidebarSeparator className="mx-0 w-full bg-(--border-subtle)" />

      {/* Footer: just the Settings link */}
      <SidebarFooter className="px-2 py-2">
        <SidebarMenu>{renderNavItem(settingsNavItem)}</SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
