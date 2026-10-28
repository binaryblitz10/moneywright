import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { GO_TO_SHORTCUTS } from '@/hooks/useKeyboardShortcuts'
import { MOD_KEY } from '@/lib/platform'

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1.5 font-sans text-[11px] font-medium text-muted-foreground">
      {children}
    </kbd>
  )
}

function ShortcutRow({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        {keys.map((key, index) => (
          <Kbd key={index}>{key}</Kbd>
        ))}
      </span>
    </div>
  )
}

interface ShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Shortcuts are ignored while you are typing.</DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-border-subtle">
          <div className="pb-2">
            <ShortcutRow label="Command palette" keys={[MOD_KEY, 'K']} />
            <ShortcutRow label="Toggle sidebar" keys={[MOD_KEY, 'B']} />
            <ShortcutRow label="Focus search on the page" keys={['/']} />
            <ShortcutRow label="Show this help" keys={['?']} />
          </div>
          <div className="pt-2">
            {GO_TO_SHORTCUTS.map((shortcut) => (
              <ShortcutRow
                key={shortcut.key}
                label={`Go to ${shortcut.label}`}
                keys={['G', shortcut.key.toUpperCase()]}
              />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
