/**
 * Shows the categorization hints saved on an account
 * They are applied automatically on top of any hints typed for a single run
 */

interface SavedHintsNoteProps {
  hints: string | null | undefined
}

export function SavedHintsNote({ hints }: SavedHintsNoteProps) {
  if (!hints) return null

  return (
    <p className="text-xs text-muted-foreground rounded-lg bg-muted/30 border border-border/50 p-2">
      <span className="font-medium text-foreground">Saved for this account: </span>
      {hints}
      <br />
      These are applied automatically. Anything you add above is used in addition.
    </p>
  )
}
