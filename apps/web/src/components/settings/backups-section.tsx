/**
 * Backups section: save copies of your data and restore an earlier one
 */

import { useState } from 'react'
import { Download, Loader2, Plus, RotateCcw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useBackups, useCreateBackup, useExportBackup, useRestoreBackup } from '@/hooks'
import { getBackupDownloadUrl } from '@/lib/api'
import type { BackupInfo, BackupKind } from '@/lib/api'

const KIND_LABELS: Record<BackupKind, string> = {
  auto: 'Automatic',
  manual: 'Manual',
  'before-restore': 'Before restore',
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function BackupsSection() {
  const { data, isLoading } = useBackups()
  const createMutation = useCreateBackup()
  const restoreMutation = useRestoreBackup()
  const exportMutation = useExportBackup()
  const [restoring, setRestoring] = useState<BackupInfo | null>(null)

  // Backups are not available for every kind of database
  if (!isLoading && data && !data.supported) return null

  const backups = data?.backups ?? []

  return (
    <Card className="border-border-subtle hover:border-border-hover transition-colors animate-fade-in">
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Backups
          </CardTitle>
          <CardDescription className="text-xs">
            Moneywright saves a copy of your data before each update. You can also save one yourself
            at any time.
          </CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Back up now
        </Button>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : backups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-subtle py-6 text-center text-sm text-muted-foreground">
            No backups yet
          </p>
        ) : (
          <div className="space-y-2">
            {backups.map((backup) => (
              <BackupRow
                key={backup.name}
                backup={backup}
                onRestore={() => setRestoring(backup)}
                onExport={() => exportMutation.mutate(backup.name)}
                exporting={exportMutation.isPending && exportMutation.variables === backup.name}
              />
            ))}
          </div>
        )}
      </CardContent>

      <AlertDialog open={restoring !== null} onOpenChange={(open) => !open && setRestoring(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current data will be replaced with the backup from{' '}
              {restoring ? formatDate(restoring.createdAt) : ''}. A safety copy of your current data
              is kept first. To finish, quit and reopen Moneywright.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (restoring) restoreMutation.mutate(restoring.name)
                setRestoring(null)
              }}
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

interface BackupRowProps {
  backup: BackupInfo
  onRestore: () => void
  onExport: () => void
  exporting: boolean
}

/** The desktop app cannot download files, so it saves them to the Downloads folder instead */
const isDesktopApp =
  typeof window !== 'undefined' && !!(window as { __TAURI__?: unknown }).__TAURI__

function BackupRow({ backup, onRestore, onExport, exporting }: BackupRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-elevated px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{formatDate(backup.createdAt)}</p>
        <p className="text-xs text-muted-foreground">
          {KIND_LABELS[backup.kind]} · {formatSize(backup.size)}
        </p>
      </div>
      {isDesktopApp ? (
        <Button variant="outline" size="sm" onClick={onExport} disabled={exporting}>
          {exporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Download
        </Button>
      ) : (
        <Button variant="outline" size="sm" asChild>
          <a href={getBackupDownloadUrl(backup.name)} download>
            <Download className="mr-2 h-4 w-4" />
            Download
          </a>
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={onRestore}>
        <RotateCcw className="mr-2 h-4 w-4" />
        Restore
      </Button>
    </div>
  )
}
