import { useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { markSidebarNavigation } from '@/lib/back-navigation'

export interface GoToShortcut {
  key: string
  label: string
  href: string
}

/** Two-key sequences: press `g`, then the key */
export const GO_TO_SHORTCUTS: GoToShortcut[] = [
  { key: 'd', label: 'Dashboard', href: '/' },
  { key: 't', label: 'Transactions', href: '/transactions' },
  { key: 'b', label: 'Budgets', href: '/budgets' },
  { key: 'r', label: 'Reports', href: '/reports' },
  { key: 'a', label: 'Accounts', href: '/accounts' },
  { key: 's', label: 'Statements', href: '/statements' },
  { key: 'i', label: 'Investments', href: '/investments' },
  { key: 'u', label: 'Subscriptions', href: '/subscriptions' },
  { key: 'p', label: 'Ask Penny', href: '/chat' },
  { key: ',', label: 'Settings', href: '/settings' },
]

const SEQUENCE_TIMEOUT_MS = 1000

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

interface UseKeyboardShortcutsOptions {
  /** Pause the shortcuts, for example while a dialog is open */
  disabled?: boolean
  onShowHelp: () => void
}

export function useKeyboardShortcuts({ disabled, onShowHelp }: UseKeyboardShortcutsOptions): void {
  const navigate = useNavigate()
  const pendingGoTo = useRef<number | null>(null)

  useEffect(() => {
    const clearPending = () => {
      if (pendingGoTo.current !== null) {
        window.clearTimeout(pendingGoTo.current)
        pendingGoTo.current = null
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (disabled || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target)) return

      if (pendingGoTo.current !== null) {
        clearPending()
        const match = GO_TO_SHORTCUTS.find((shortcut) => shortcut.key === event.key)
        if (match) {
          event.preventDefault()
          markSidebarNavigation()
          navigate({ to: match.href })
        }
        return
      }

      if (event.key === 'g') {
        pendingGoTo.current = window.setTimeout(clearPending, SEQUENCE_TIMEOUT_MS)
      } else if (event.key === '/') {
        const search = document.querySelector<HTMLInputElement>('[data-page-search]')
        if (search) {
          event.preventDefault()
          search.focus()
        }
      } else if (event.key === '?') {
        event.preventDefault()
        onShowHelp()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      clearPending()
    }
  }, [disabled, navigate, onShowHelp])
}
