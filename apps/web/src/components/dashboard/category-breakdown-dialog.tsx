/**
 * Dialog listing every category of a category breakdown widget
 */

import {
  focusDialogOnOpen,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CategoryBreakdown } from './category-breakdown'
import type { CategoryComparison } from './category-comparison'

interface CategoryBreakdownDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  categoryBreakdown: { category: string; total: number; count: number }[]
  total: number
  currency: string
  getCategoryLabel: (code: string) => string
  getCategoryColor: (code: string) => string
  showMonthlyAverage: boolean
  totalMonths: number
  startDate?: string
  endDate?: string
  totalLabel?: string
  averageLabel?: string
  emptyTitle?: string
  comparison?: CategoryComparison | null
}

export function CategoryBreakdownDialog({
  open,
  onOpenChange,
  title,
  ...breakdownProps
}: CategoryBreakdownDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onOpenAutoFocus={focusDialogOnOpen}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Click a category to see its transactions</DialogDescription>
        </DialogHeader>
        {/* The rows bleed 8px past their column for the hover highlight, which the scroll area
            would clip, so it gets that room back as padding */}
        <ScrollArea className="-mx-2 max-h-[60vh]">
          <div className="px-2 pr-5">
            <CategoryBreakdown {...breakdownProps} limit={Infinity} />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
