/** True when running inside the Tauri desktop app on macOS (overlay title bar) */
export const isMacDesktop: boolean =
  typeof window !== 'undefined' &&
  !!(window as { __TAURI__?: unknown }).__TAURI__ &&
  /Mac/i.test(navigator.platform)
