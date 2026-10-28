/** Label for the primary modifier key: Command on Mac, Ctrl elsewhere */
export const MOD_KEY: string =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘' : 'Ctrl'
