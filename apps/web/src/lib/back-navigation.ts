import { useSyncExternalStore } from 'react'
import type { AnyRouter } from '@tanstack/react-router'

const PAGE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/reports': 'Reports',
  '/chat': 'Ask Penny',
  '/accounts': 'Accounts',
  '/statements': 'Statements',
  '/transactions': 'Transactions',
  '/review': 'Review',
  '/subscriptions': 'Subscriptions',
  '/investments': 'Investments',
  '/insurance': 'Insurance',
  '/loans': 'Loans',
  '/settings': 'Settings',
}

// Page the user came from, keyed by history index so Back/Forward keep the right button
const originByIndex = new Map<number, string>()
const listeners = new Set<() => void>()
let currentIndex = 0
let sidebarNavigation = false

function emit(): void {
  listeners.forEach((listener) => listener())
}

/** Call before a sidebar navigation: moving between top-level pages isn't a drill-down. */
export function markSidebarNavigation(): void {
  sidebarNavigation = true
}

/** Records which page each navigation came from. Call once when the router is created. */
export function trackBackNavigation(router: AnyRouter): void {
  currentIndex = router.history.location.state.__TSR_index

  router.subscribe('onResolved', ({ fromLocation, toLocation, pathChanged }) => {
    const index = toLocation.state.__TSR_index
    const isPush = index > currentIndex
    currentIndex = index

    if (!pathChanged || !isPush) return
    const label = fromLocation && PAGE_LABELS[fromLocation.pathname]
    if (label && !sidebarNavigation) originByIndex.set(index, label)
    else originByIndex.delete(index)
    sidebarNavigation = false
    emit()
  })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Label of the page the user drilled in from, or null when there's nothing to go back to. */
export function useBackLabel(): string | null {
  return useSyncExternalStore(subscribe, () => originByIndex.get(currentIndex) ?? null)
}
