import { forwardRef } from 'react'
import { Loader2, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ReviewActionButtonProps extends Omit<React.ComponentProps<typeof Button>, 'children'> {
  icon: LucideIcon
  label: string
  /** Swaps the icon for a spinner */
  loading?: boolean
}

/** The big green action under a review card, shared so every review tab looks the same */
export const ReviewActionButton = forwardRef<HTMLButtonElement, ReviewActionButtonProps>(
  function ReviewActionButton({ icon: Icon, label, loading = false, ...props }, ref) {
    return (
      <Button ref={ref} className="h-12 w-44 rounded-xl text-base" {...props}>
        {loading ? <Loader2 className="size-6 animate-spin" /> : <Icon className="size-6" />}
        <span className="ml-2">{label}</span>
      </Button>
    )
  }
)
