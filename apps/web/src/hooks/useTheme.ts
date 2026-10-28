import { useSyncExternalStore } from 'react'

type Theme = 'light' | 'dark'

const listeners = new Set<() => void>()

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const stored = localStorage.getItem('theme') as Theme | null
  if (stored) return stored
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

// Shared by every useTheme caller so they all stay in sync
let currentTheme: Theme = readInitialTheme()
if (typeof window !== 'undefined') applyTheme(currentTheme)

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): Theme {
  return currentTheme
}

// Only an explicit choice is saved, so the theme keeps following the system until then
function setTheme(newTheme: Theme) {
  localStorage.setItem('theme', newTheme)
  currentTheme = newTheme
  applyTheme(newTheme)
  listeners.forEach((listener) => listener())
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => 'dark' as Theme)
  return { theme, setTheme }
}
