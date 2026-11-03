/**
 * The data health report, built once per pass of the fixers that read it.
 */

import { getDataHealth, type DataHealthReport } from '../data-health'
import type { FixContext } from './types'

const reports = new WeakMap<FixContext, Promise<DataHealthReport>>()

/** The data health report for the context's profile; the contexts are made per pass, so it is never stale */
export function healthFor(ctx: FixContext): Promise<DataHealthReport> {
  let report = reports.get(ctx)
  if (!report) {
    report = getDataHealth(ctx.userId, { profileId: ctx.profileId })
    reports.set(ctx, report)
  }
  return report
}
