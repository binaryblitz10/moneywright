/**
 * Auto-fix: the shapes shared by the fixers and the framework that runs them.
 */

import type { CountryCode } from '../../lib/constants'

/** Who is being fixed, and what the AI-backed fixers may use */
export interface FixContext {
  userId: string
  profileId?: string
  countryCode: CountryCode
  /** `provider:model` for categorization; unset uses the first configured provider */
  model?: string
}

/** One thing a fixer found and can fix */
export interface Fix {
  /** Deterministic from the fixer and the rows involved, so a preview and the apply that follows agree */
  id: string
  fixer: string
  /** A plain sentence for the preview, e.g. "Merge 2 copies of SWIGGY INR 450.00 on 2025-10-03" */
  description: string
  entityIds: string[]
  /** Whatever the fixer's apply needs, found once by `find` */
  data: unknown
}

export type ChangeEntityType = 'transaction' | 'statement' | 'sms_message'

/**
 * One row changed by a fix. `before` and `after` hold only the columns that changed, so undo
 * can tell whether the row was edited since. A deleted row has its full row in `before` (so undo
 * can re-insert it) and `after` null.
 */
export interface ChangeRecord {
  entityType: ChangeEntityType
  entityId: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  description: string
}

export interface Fixer {
  id: string
  label: string
  /** Safe fixers run on their own after an import; the others wait for the user's button */
  safe: boolean
  usesAi: boolean
  find(ctx: FixContext): Promise<Fix[]>
  apply(ctx: FixContext, fix: Fix): Promise<ChangeRecord[]>
}
