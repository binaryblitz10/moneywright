/**
 * Dialog listing every category of a category breakdown widget
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CategoryBreakdown } from './category-breakdown'

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
}

export function CategoryBreakdownDialog({
  open,
  onOpenChange,
  title,
  ...breakdownProps
}: CategoryBreakdownDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Click a category to see its transactions</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-3">
          <CategoryBreakdown {...breakdownProps} limit={Infinity} />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
