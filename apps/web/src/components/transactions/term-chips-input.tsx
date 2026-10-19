import { useState } from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface TermChipsInputProps {
  id?: string
  value: string[]
  onChange: (terms: string[]) => void
  placeholder?: string
  className?: string
}

/** Chip input for rule terms: Enter adds a term (spaces allowed), × or Backspace removes one */
export function TermChipsInput({
  id,
  value,
  onChange,
  placeholder = 'Type a term and press Enter',
  className,
}: TermChipsInputProps) {
  const [draft, setDraft] = useState('')

  const addDraft = () => {
    const term = draft.trim().replace(/\s+/g, ' ')
    setDraft('')
    if (!term || value.some((existing) => existing.toLowerCase() === term.toLowerCase())) return
    onChange([...value, term])
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addDraft()
    } else if (e.key === 'Backspace' && !draft && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      {value.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {value.map((term) => (
            <span
              key={term}
              className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg text-xs font-medium border transition-all hover:shadow-sm bg-surface-elevated text-foreground border-border-subtle"
            >
              <span className="max-w-37.5 truncate uppercase">{term}</span>
              <button
                type="button"
                aria-label={`Remove ${term}`}
                onClick={() => onChange(value.filter((existing) => existing !== term))}
                className="p-0.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addDraft}
        placeholder={placeholder}
        className="h-10 rounded-md border border-input bg-background px-3 py-2"
      />
    </div>
  )
}
