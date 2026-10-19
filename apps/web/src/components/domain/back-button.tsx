import { useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBackLabel } from '@/lib/back-navigation'

/** Returns to the page that linked here, with its filters intact. Hidden when there is none. */
export function BackButton() {
  const router = useRouter()
  const label = useBackLabel()

  if (!label) return null

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 mb-4 text-muted-foreground hover:text-foreground"
      onClick={() => router.history.back()}
    >
      <ArrowLeft />
      {label}
    </Button>
  )
}
