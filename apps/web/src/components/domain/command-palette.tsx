import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Moon, Plus, Search, Sun, Upload } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { useSmsImportStatus } from '@/hooks'
import { useTheme } from '@/hooks/useTheme'
import { markSidebarNavigation } from '@/lib/back-navigation'
import { askPennyNavItem, getNavGroups, settingsNavItem } from './nav-items'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const { data: smsStatus } = useSmsImportStatus()
  const [query, setQuery] = useState('')

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onOpenChange])

  const handleOpenChange = (next: boolean) => {
    if (!next) setQuery('')
    onOpenChange(next)
  }

  const run = (action: () => void) => {
    handleOpenChange(false)
    action()
  }

  const go = (href: string) =>
    run(() => {
      markSidebarNavigation()
      navigate({ to: href })
    })

  const trimmedQuery = query.trim()
  const destinations = [
    ...getNavGroups(!!smsStatus?.enabled).flatMap((group) => group.items),
    askPennyNavItem,
    settingsNavItem,
  ]
  const isDark = theme === 'dark'

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandInput
        placeholder="Search pages and actions..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {trimmedQuery && (
          <>
            <CommandGroup heading="Search">
              <CommandItem
                value={`search transactions ${trimmedQuery}`}
                forceMount
                onSelect={() =>
                  run(() => navigate({ to: '/transactions', search: { q: trimmedQuery } }))
                }
              >
                <Search />
                Search transactions for &lsquo;{trimmedQuery}&rsquo;
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        <CommandGroup heading="Navigate">
          {destinations.map((item) => (
            <CommandItem key={item.href} value={`go ${item.title}`} onSelect={() => go(item.href)}>
              <item.icon />
              {item.title}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            value="action upload statement"
            onSelect={() => run(() => navigate({ to: '/statements', search: { upload: true } }))}
          >
            <Upload />
            Upload statement
          </CommandItem>
          <CommandItem
            value="action add subscription"
            onSelect={() => run(() => navigate({ to: '/subscriptions', search: { add: true } }))}
          >
            <Plus />
            Add subscription
          </CommandItem>
          <CommandItem value="action ask penny" onSelect={() => go(askPennyNavItem.href)}>
            <askPennyNavItem.icon />
            Ask Penny
          </CommandItem>
          <CommandItem
            value="action toggle theme"
            onSelect={() => run(() => setTheme(isDark ? 'light' : 'dark'))}
          >
            {isDark ? <Sun /> : <Moon />}
            Toggle theme
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
