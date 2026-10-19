import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useCategorizationStatus } from '@/hooks'
import type { CategorizationStatus } from '@/lib/api'

/**
 * ProcessingStatus - Shows parsing/categorization status as a small capsule
 * Displayed in the page header when processing is active
 * Features a blinking dot and shimmer effect
 *
 * Query is invalidated when uploads/recategorization triggers,
 * then polls every 5 seconds while active
 */
export function ProcessingStatus() {
  const { data: status } = useCategorizationStatus()

  // Tell the user when background work finishes (active -> idle), using the last kind seen
  const lastActiveType = useRef<CategorizationStatus['type']>(null)
  const wasActive = useRef(false)
  useEffect(() => {
    if (!status) return
    if (status.active) {
      wasActive.current = true
      lastActiveType.current = status.type
    } else if (wasActive.current) {
      wasActive.current = false
      toast.success(
        lastActiveType.current === 'recategorizing'
          ? 'Recategorization complete'
          : 'Statements processed. Your transactions are ready'
      )
    }
  }, [status])

  if (!status?.active) {
    return null
  }

  const getMessage = () => {
    if (status.type === 'parsing') {
      if (status.progress) {
        return `Parsing ${status.progress.current}/${status.progress.total}`
      }
      return 'Parsing'
    }
    if (status.type === 'categorizing') {
      return 'Categorizing'
    }
    if (status.type === 'recategorizing') {
      if (status.progress) {
        return `Recategorizing ${status.progress.current}/${status.progress.total}`
      }
      return 'Recategorizing'
    }
    return 'Processing'
  }

  return (
    <div className="relative h-10 flex items-center gap-2 px-4 rounded-xl bg-primary/10 border border-primary/20 text-sm font-medium text-primary overflow-hidden">
      {/* Shimmer effect */}
      <div className="absolute inset-0 animate-shimmer-slide bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

      {/* Blinking dot */}
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
      </span>

      {/* Text */}
      <span className="relative">{getMessage()}</span>
    </div>
  )
}
