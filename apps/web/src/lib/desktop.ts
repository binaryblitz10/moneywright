/** True when running inside the Tauri desktop app on macOS (overlay title bar) */
export const isMacDesktop: boolean =
  typeof window !== 'undefined' &&
  !!(window as { __TAURI__?: unknown }).__TAURI__ &&
  /Mac/i.test(navigator.platform)

/** True inside the desktop app, which cannot download files and saves them to Downloads instead */
export const isDesktopApp: boolean =
  typeof window !== 'undefined' && !!(window as { __TAURI__?: unknown }).__TAURI__
