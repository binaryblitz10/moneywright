import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** "1 transaction", "3 transactions", "2 categories" */
export function plural(count: number, word: string): string {
  const many = /[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`
  return `${count} ${count === 1 ? word : many}`
}
