import { createContext, useContext, useState, type ComponentProps } from 'react'
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible'
import { cn } from '@/lib/utils'

const CollapsibleOpenContext = createContext(false)

/**
 * Collapsible root. Tracks the open state itself (controlled or not) so that
 * CollapsibleContent can animate instead of mounting and unmounting.
 */
function Collapsible({
  open,
  defaultOpen = false,
  onOpenChange,
  ...props
}: ComponentProps<typeof CollapsiblePrimitive.Root>) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const isOpen = open ?? uncontrolledOpen

  return (
    <CollapsibleOpenContext.Provider value={isOpen}>
      <CollapsiblePrimitive.Root
        open={isOpen}
        onOpenChange={(next) => {
          setUncontrolledOpen(next)
          onOpenChange?.(next)
        }}
        {...props}
      />
    </CollapsibleOpenContext.Provider>
  )
}

const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger

/**
 * The app's standard expand animation: the height eases open while the content
 * fades in and slides down into place. `className` styles the revealed content
 * (margins included, they are clipped while closed). Children stay mounted so the
 * close animates too; the closed panel is `inert`.
 */
function CollapsibleContent({ className, children, ...props }: ComponentProps<'div'>) {
  const open = useContext(CollapsibleOpenContext)

  return (
    <div
      data-state={open ? 'open' : 'closed'}
      inert={!open}
      className={cn(
        'grid overflow-hidden transition-all duration-500 ease-in-out',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      )}
      {...props}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className={cn(
            'transition-transform duration-500 ease-in-out',
            open ? 'translate-y-0' : '-translate-y-4',
            className
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
