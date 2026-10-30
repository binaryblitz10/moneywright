/**
 * Shared look of the searchable dropdowns (category picker, institution picker, ...)
 * so every one of them uses the same theming.
 */

export const ROW_CLASS =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-foreground/85 transition-colors disabled:pointer-events-none disabled:opacity-50'
export const ROW_ACTIVE_CLASS = 'bg-foreground/[0.08] text-foreground'
/** For rows outside the keyboard-highlighted list, which have no highlight of their own */
export const ROW_HOVER_CLASS = 'hover:bg-foreground/[0.08] hover:text-foreground'

export const PICKER_TRIGGER_CLASS =
  'h-10 w-full justify-between rounded-lg font-normal bg-surface-elevated border-border-subtle hover:bg-surface-hover hover:border-border-hover'
export const PICKER_CONTENT_CLASS =
  'w-(--radix-popover-trigger-width) min-w-72 overflow-hidden rounded-xl border-border-hover bg-popover p-0 dark:bg-background shadow-2xl shadow-black/15 dark:shadow-black/60'
export const PICKER_SEARCH_CLASS =
  'h-11 rounded-none border-0 bg-transparent pl-10 text-sm shadow-none focus-visible:ring-0'
export const PICKER_LIST_CLASS = 'max-h-72 space-y-0.5 overflow-y-auto p-1.5 [scrollbar-width:thin]'
