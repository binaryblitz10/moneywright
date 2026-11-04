import { useRef, useState } from 'react'
import { Info } from 'lucide-react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { useTransactionSmsMessage } from '@/hooks/useSmsImport'

const HOVER_CLOSE_DELAY_MS = 150

interface SmsSourceInfoProps {
  transactionId: string
}

/**
 * Info icon that shows the bank message a transaction came from, on hover or click.
 * Nothing is shown when no message text was kept.
 */
export function SmsSourceInfo({ transactionId }: SmsSourceInfoProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const { data: message } = useTransactionSmsMessage(transactionId, true)

  const show = () => {
    clearTimeout(closeTimer.current)
    setOpen(true)
  }
  const hideSoon = () => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS)
  }

  if (!message) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          ref={buttonRef}
          type="button"
          aria-label="Show bank message"
          className="shrink-0 rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={show}
          onMouseEnter={show}
          onMouseLeave={hideSoon}
        >
          <Info className="size-3.5" />
        </button>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-80 p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (buttonRef.current?.contains(e.target as Node)) e.preventDefault()
        }}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
      >
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="mb-1 text-xs text-muted-foreground">
            {message.sender} · {new Date(message.receivedAt).toLocaleString()}
          </p>
          <p className="text-sm break-words whitespace-pre-wrap">{message.body}</p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
