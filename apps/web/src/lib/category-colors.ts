/**
 * Category color mapping for Tailwind classes
 * Uses bright colors that stay readable on dark themes
 */

export interface CategoryColorClasses {
  /** Muted dot color for category identification */
  dot: string
  /** Background color for badges/indicators */
  bg: string
  /** Text color for badges/indicators */
  text: string
  /** Bar/progress color */
  bar: string
}

/**
 * Bright color palette: -500 for fills, -400 for text
 */
export const CATEGORY_COLOR_MAP: Record<string, CategoryColorClasses> = {
  orange: {
    dot: 'bg-orange-500',
    bg: 'bg-orange-500/15',
    text: 'text-orange-400',
    bar: 'bg-orange-500',
  },
  lime: {
    dot: 'bg-lime-500',
    bg: 'bg-lime-500/15',
    text: 'text-lime-400',
    bar: 'bg-lime-500',
  },
  blue: {
    dot: 'bg-blue-500',
    bg: 'bg-blue-500/15',
    text: 'text-blue-400',
    bar: 'bg-blue-500',
  },
  cyan: {
    dot: 'bg-cyan-500',
    bg: 'bg-cyan-500/15',
    text: 'text-cyan-400',
    bar: 'bg-cyan-500',
  },
  rose: {
    dot: 'bg-rose-500',
    bg: 'bg-rose-500/15',
    text: 'text-rose-400',
    bar: 'bg-rose-500',
  },
  purple: {
    dot: 'bg-purple-500',
    bg: 'bg-purple-500/15',
    text: 'text-purple-400',
    bar: 'bg-purple-500',
  },
  amber: {
    dot: 'bg-amber-500',
    bg: 'bg-amber-500/15',
    text: 'text-amber-400',
    bar: 'bg-amber-500',
  },
  pink: {
    dot: 'bg-pink-500',
    bg: 'bg-pink-500/15',
    text: 'text-pink-400',
    bar: 'bg-pink-500',
  },
  sky: { dot: 'bg-sky-500', bg: 'bg-sky-500/15', text: 'text-sky-400', bar: 'bg-sky-500' },
  red: { dot: 'bg-red-500', bg: 'bg-red-500/15', text: 'text-red-400', bar: 'bg-red-500' },
  fuchsia: {
    dot: 'bg-fuchsia-500',
    bg: 'bg-fuchsia-500/15',
    text: 'text-fuchsia-400',
    bar: 'bg-fuchsia-500',
  },
  indigo: {
    dot: 'bg-indigo-500',
    bg: 'bg-indigo-500/15',
    text: 'text-indigo-400',
    bar: 'bg-indigo-500',
  },
  slate: {
    dot: 'bg-slate-500',
    bg: 'bg-slate-500/15',
    text: 'text-slate-400',
    bar: 'bg-slate-500',
  },
  violet: {
    dot: 'bg-violet-500',
    bg: 'bg-violet-500/15',
    text: 'text-violet-400',
    bar: 'bg-violet-500',
  },
  zinc: {
    dot: 'bg-zinc-500',
    bg: 'bg-zinc-500/15',
    text: 'text-zinc-400',
    bar: 'bg-zinc-500',
  },
  green: {
    dot: 'bg-green-500',
    bg: 'bg-green-500/15',
    text: 'text-green-400',
    bar: 'bg-green-500',
  },
  emerald: {
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-400',
    bar: 'bg-emerald-500',
  },
  teal: {
    dot: 'bg-teal-500',
    bg: 'bg-teal-500/15',
    text: 'text-teal-400',
    bar: 'bg-teal-500',
  },
}

/**
 * Default color for unknown categories
 */
export const DEFAULT_CATEGORY_COLOR: CategoryColorClasses = {
  dot: 'bg-zinc-500',
  bg: 'bg-zinc-500/15',
  text: 'text-zinc-400',
  bar: 'bg-zinc-500',
}

/**
 * Get color classes for a category color name
 */
export function getCategoryColorClasses(colorName: string): CategoryColorClasses {
  return CATEGORY_COLOR_MAP[colorName] || DEFAULT_CATEGORY_COLOR
}

/**
 * Get a CSS color value for a category color name, for SVG fills (e.g. pie charts).
 * Derived from the bar class so it matches the shade used elsewhere.
 */
export function getCategoryFillColor(colorName: string): string {
  const match = getCategoryColorClasses(colorName).bar.match(/^bg-([a-z]+-\d+)/)
  return match ? `var(--color-${match[1]})` : 'var(--color-zinc-500)'
}
