/**
 * The safe fixes that run on their own once an import has finished.
 */

import { logger } from '../../lib/logger'
import { isAutoFixAfterImportEnabled } from '../preferences'
import { applyFixes, type ApplyResult, type FixContext } from './index'

/**
 * Apply the safe fixes if the user has not switched that off. Returns what was fixed, or null
 * when nothing was or the fixing failed: a problem here must never fail the import itself.
 */
export async function applySafeFixesAfterImport(
  ctx: FixContext,
  statementIds: string[]
): Promise<ApplyResult | null> {
  try {
    if (!(await isAutoFixAfterImportEnabled(ctx.userId, ctx.profileId))) return null
    const result = await applyFixes(ctx, { safeOnly: true, trigger: 'import', statementIds })
    return result.batchId ? result : null
  } catch (error) {
    logger.error('[AutoFix] Fixing after import failed:', error)
    return null
  }
}
