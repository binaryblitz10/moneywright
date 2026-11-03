import { Link } from '@tanstack/react-router'
import type { ImportReport as ImportReportData } from '@/lib/api'

interface ImportReportProps {
  report: ImportReportData
  /** Issues fixed automatically after the import */
  autoFixCount: number
}

const linkClass = 'text-primary hover:underline underline-offset-2'

/** What an import did: new rows, repeats, bank message matches, who categorized, what needs a look */
export function ImportReport({ report, autoFixCount }: ImportReportProps) {
  const imported = [
    `${report.inserted} new`,
    report.skippedDuplicates > 0 && `${report.skippedDuplicates} already imported`,
    report.mergedWithBankMessages > 0 &&
      `${report.mergedWithBankMessages} matched with bank messages`,
    report.possibleMatches > 0 &&
      `${report.possibleMatches} possible ${report.possibleMatches === 1 ? 'match' : 'matches'}`,
  ].filter(Boolean)

  const { rule, memory, ai } = report.categorizedBy
  const categorized = [
    memory > 0 && `${memory} from memory`,
    ai > 0 && `${ai} by AI`,
    rule > 0 && `${rule} by rules`,
  ].filter(Boolean)

  return (
    <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
      <p>{imported.join(' · ')}</p>
      {categorized.length > 0 && <p>Categorized: {categorized.join(' · ')}</p>}
      {(report.needsReview > 0 || autoFixCount > 0) && (
        <p className="flex flex-wrap gap-x-3">
          {report.needsReview > 0 && (
            <Link to="/review" search={{ tab: 'categorization' }} className={linkClass}>
              {report.needsReview} need review
            </Link>
          )}
          {autoFixCount > 0 && (
            <Link to="/review" search={{ tab: 'auto-fixed' }} className={linkClass}>
              Fixed {autoFixCount} {autoFixCount === 1 ? 'issue' : 'issues'} automatically
            </Link>
          )}
        </p>
      )}
    </div>
  )
}
