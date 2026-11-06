import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Plus } from 'lucide-react'
import { useUpdateTransaction } from '@/hooks'
import type { Transaction } from '@/lib/api'

const NOTE_PREVIEW_LENGTH = 30

/** First line of a note, cut to a short preview */
function truncateNote(note: string): string {
  const line = (note.split('\n')[0] ?? '').trim()
  return line.length > NOTE_PREVIEW_LENGTH
    ? `${line.slice(0, NOTE_PREVIEW_LENGTH).trimEnd()}…`
    : line
}

interface InlineNoteProps {
  transaction: Transaction
  /** Read-only: shows the note (if any) without the add / edit affordance */
  editable?: boolean
}

/**
 * A transaction's note inside a row: a dashed "+ Note" chip when empty, the note text
 * otherwise. Clicking either swaps in a one-line input; Enter or blur saves, Esc cancels.
 */
export function InlineNote({ transaction, editable = true }: InlineNoteProps) {
  const updateTransaction = useUpdateTransaction()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const finishedRef = useRef(false)
  const fieldRef = useRef<HTMLLabelElement>(null)
  const note = transaction.notes ?? ''

  // Keep clicks from reaching the row (which opens the edit dialog or toggles selection)
  const stop = (e: MouseEvent) => e.stopPropagation()

  const start = (e: MouseEvent) => {
    e.stopPropagation()
    finishedRef.current = false
    setValue(note)
    setEditing(true)
  }

  // A click outside the input only closes it: swallow that click so the row doesn't react to it
  useEffect(() => {
    if (!editing) return
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Node && fieldRef.current?.contains(e.target)) return
      const swallow = (click: Event) => click.stopPropagation()
      window.addEventListener('click', swallow, { capture: true, once: true })
      // No click follows a drag or a cancelled press, so don't leave the listener armed
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 1000)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [editing])

  const finish = (save: boolean) => {
    if (finishedRef.current) return
    finishedRef.current = true
    setEditing(false)
    const next = value.trim()
    if (save && next !== note.trim()) {
      updateTransaction.mutate({ transactionId: transaction.id, data: { notes: next } })
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation()
    if (e.key === 'Enter') finish(true)
    else if (e.key === 'Escape') finish(false)
  }

  if (editing) {
    return (
      <label
        ref={fieldRef}
        onClick={stop}
        className="flex h-[18px] min-w-28 max-w-72 shrink-0 animate-in items-center gap-1 rounded-full border border-border bg-surface-elevated px-1.5 fade-in-0 zoom-in-95 duration-150 focus-within:border-foreground/40"
      >
        <Plus className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={value}
          maxLength={500}
          placeholder="Add a note"
          aria-label="Transaction note"
          className="field-sizing-content min-w-16 max-w-56 border-0 bg-transparent p-0 text-xs leading-4 text-foreground outline-none placeholder:text-muted-foreground/60"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => finish(true)}
        />
      </label>
    )
  }

  if (note) {
    return editable ? (
      <button
        type="button"
        title="Edit note"
        onClick={start}
        className="shrink-0 cursor-text text-left text-xs italic text-muted-foreground hover:text-foreground"
      >
        {truncateNote(note)}
      </button>
    ) : (
      <p className="shrink-0 text-xs italic text-muted-foreground">{truncateNote(note)}</p>
    )
  }

  if (!editable) return null

  return (
    <button
      type="button"
      onClick={start}
      className="inline-flex shrink-0 items-center gap-0.5 rounded border border-dashed border-border px-1.5 text-[10px] font-medium leading-4 text-muted-foreground opacity-0 transition-all hover:border-foreground/40 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:hidden"
    >
      <Plus className="h-2.5 w-2.5" />
      Note
    </button>
  )
}
