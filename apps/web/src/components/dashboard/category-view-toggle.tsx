/**
 * Toggle between list and pie chart views of a category breakdown
 */

import { List, PieChart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type CategoryView = 'list' | 'pie'

interface CategoryViewToggleProps {
  view: CategoryView
  onViewChange: (view: CategoryView) => void
}

export function CategoryViewToggle({ view, onViewChange }: CategoryViewToggleProps) {
  const isPie = view === 'pie'
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={isPie ? 'Show as list' : 'Show as pie chart'}
      title={isPie ? 'Show as list' : 'Show as pie chart'}
      onClick={(e) => {
        e.stopPropagation()
        onViewChange(isPie ? 'list' : 'pie')
      }}
      className={cn(
        'h-7 w-7 p-0',
        isPie ? 'text-primary hover:text-primary' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {isPie ? <List className="size-4" /> : <PieChart className="size-4" />}
    </Button>
  )
}
