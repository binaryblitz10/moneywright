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

  const root = document.documentElement
  const commit = () => {
    applyTheme(newTheme)
    listeners.forEach((listener) => listener())
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduceMotion || typeof document.startViewTransition !== 'function') {
    commit()
    return
  }

  // The browser cross-fades a snapshot of the old page into the new one on the GPU, so
  // nothing animates per element; colour transitions are off until it finishes
  root.classList.add('theme-switching')

  // Hold the hover look of the toggle under the pointer until the pointer moves after the fade
  const held = document.querySelector<HTMLElement>('[data-theme-toggle]:hover')
  if (held) held.dataset.hoverHold = ''

  const done = () => {
    root.classList.remove('theme-switching')
    if (held) {
      window.addEventListener('pointermove', () => delete held.dataset.hoverHold, { once: true })
    }
  }
  document.startViewTransition(commit).finished.then(done, done)
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => 'dark' as Theme)
  return { theme, setTheme }
}
