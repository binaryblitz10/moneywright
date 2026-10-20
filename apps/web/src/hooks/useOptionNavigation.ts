import {
  useCallback,
  useEffect,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'

const OPTION = '[data-option]'
const ACTIVE = 'data-active'
// Fields that keep their own arrow and Enter keys (date inputs, selects), except the search box
const OWN_KEYS = 'input:not([data-option-search]), textarea, select, [role="combobox"]'

function getOptions(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(OPTION)].filter(
    (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
  )
}

function setActive(root: HTMLElement, option: HTMLElement | undefined, scroll: boolean): void {
  root.querySelectorAll(`[${ACTIVE}]`).forEach((el) => el.removeAttribute(ACTIVE))
  if (!option) return
  option.setAttribute(ACTIVE, '')
  if (scroll) option.scrollIntoView({ block: 'nearest' })
}

// The selected option, or the first one, is highlighted when the list opens or is searched
function resetActive(root: HTMLElement): void {
  const options = getOptions(root)
  setActive(root, options.find((el) => el.hasAttribute('data-selected')) ?? options[0], true)
}

/**
 * Arrow keys, Enter and hover for a popover list. Mark each choice with `data-option` (and
 * `data-selected` when chosen), style it with the `data-active:` variant, and mark the search
 * input with `data-option-search`. Spread the result onto the PopoverContent.
 *
 * @param resetKey changes whenever the visible options change (e.g. the search text)
 */
export function useOptionNavigation(resetKey?: unknown) {
  const rootRef = useRef<HTMLElement | null>(null)

  // Runs when the popover content mounts, so it works for uncontrolled popovers too
  const ref = useCallback((node: HTMLElement | null) => {
    rootRef.current = node
    if (node) resetActive(node)
  }, [])

  useEffect(() => {
    if (rootRef.current) resetActive(rootRef.current)
  }, [resetKey])

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const root = e.currentTarget
    const target = e.target as HTMLElement
    if (target.closest(OWN_KEYS)) return

    const options = getOptions(root)
    const current = options.findIndex((el) => el.hasAttribute(ACTIVE))

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (options.length === 0) return
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      const next =
        options[
          current < 0
            ? step > 0
              ? 0
              : options.length - 1
            : (current + step + options.length) % options.length
        ]
      setActive(root, next, true)
      // Keep keyboard focus on the highlighted choice so Space and Enter act on it
      if (target.hasAttribute('data-option')) next?.focus({ preventScroll: true })
    } else if (e.key === 'Enter') {
      const active = options[current]
      if (!active) return
      e.preventDefault()
      active.click()
    }
  }

  const onMouseMove = (e: MouseEvent<HTMLElement>) => {
    const option = (e.target as HTMLElement).closest<HTMLElement>(OPTION)
    if (option && !option.hasAttribute(ACTIVE)) setActive(e.currentTarget, option, false)
  }

  const onFocus = (e: FocusEvent<HTMLElement>) => {
    const option = (e.target as HTMLElement).closest<HTMLElement>(OPTION)
    if (option && !option.hasAttribute(ACTIVE)) setActive(e.currentTarget, option, false)
  }

  return { ref, onKeyDown, onMouseMove, onFocus }
}
