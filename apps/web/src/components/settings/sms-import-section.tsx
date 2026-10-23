/**
 * Bank Messages alerts: turn on reading card transaction messages from the Mac's Messages app,
 * and import older messages from a chosen date. The synced messages are listed on the Bank Messages page.
 */

import { useState } from 'react'
import { Loader2, RefreshCw, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { SectionCard } from '@/components/ui/section-card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { DeleteSmsTransactionsButton } from './delete-sms-transactions-button'
import {
  useOpenSmsPermissionSettings,
  useSmsImportStatus,
  useSyncSmsImport,
  useUpdateSmsImportSettings,
} from '@/hooks'
import type { SmsImportStatus } from '@/lib/api'

const DEFAULT_DAYS_BACK = 7

function toDateInput(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function daysAgo(days: number): Date {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date
}

export function SmsImportSection() {
  const { data: status } = useSmsImportStatus()

  if (!status?.supported) return null

  return <SettingsCard status={status} />
}

interface SettingRowProps {
  id: string
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}

function SettingRow({
  id,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: SettingRowProps) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="space-y-1">
        <Label htmlFor={id} className="cursor-pointer text-sm font-medium">
          {label}
        </Label>
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function SettingsCard({ status }: { status: SmsImportStatus }) {
  const updateMutation = useUpdateSmsImportSettings()
  const openSettingsMutation = useOpenSmsPermissionSettings()
  const syncMutation = useSyncSmsImport()
  const { refetch, isFetching } = useSmsImportStatus()
  const [syncOpen, setSyncOpen] = useState(false)
  const [since, setSince] = useState(toDateInput(daysAgo(DEFAULT_DAYS_BACK)))

  const needsPermission = status.enabled && status.access !== 'ok'
  const aiBlocked = !status.aiAvailable && !status.aiParsing

  const checkAgain = async () => {
    const { data } = await refetch()
    if (data?.access === 'ok') {
      toast.success('Moneywright can read your messages')
    } else {
      toast.error('Still no access. Reopen Moneywright after allowing it, then try again.')
    }
  }

  return (
    <SectionCard
      title="Bank Messages"
      description="Import transactions from bank text messages."
      contentClassName="space-y-6"
    >
      <SettingRow
        id="sms-import-enabled"
        label="Read bank messages"
        description="New alerts are read when the app opens or when you press Sync."
        checked={status.enabled}
        disabled={updateMutation.isPending}
        onCheckedChange={(enabled) => updateMutation.mutate({ enabled })}
      />

      <SettingRow
        id="sms-import-ai"
        label="Use AI to read and categorize"
        description={
          aiBlocked
            ? 'Set up an AI provider to use this.'
            : 'Your AI provider reads messages the rules can’t and categorizes transactions.'
        }
        checked={status.aiParsing}
        disabled={updateMutation.isPending || aiBlocked}
        onCheckedChange={(aiParsing) => updateMutation.mutate({ aiParsing })}
      />

      {status.enabled && !needsPermission && (
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <p className="text-sm font-medium">Sync past messages</p>
            <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
              Import older bank messages from a date you choose.
            </p>
          </div>
          <Dialog open={syncOpen} onOpenChange={setSyncOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync past messages
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Sync past messages</DialogTitle>
                <DialogDescription>
                  Reads every bank message received since this date. Messages already imported are
                  skipped.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="sms-sync-since" className="text-sm font-medium">
                  Since
                </Label>
                <Input
                  id="sms-sync-since"
                  type="date"
                  max={toDateInput(new Date())}
                  value={since}
                  onChange={(e) => setSince(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSyncOpen(false)}>
                  Cancel
                </Button>
                <Button
                  disabled={!since || syncMutation.isPending}
                  onClick={() =>
                    syncMutation.mutate(since, { onSuccess: () => setSyncOpen(false) })
                  }
                >
                  {syncMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Sync from date
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {needsPermission && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Allow access to Messages</p>
              <p className="text-xs text-muted-foreground">
                Turn on Moneywright in Full Disk Access, then reopen the app.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={openSettingsMutation.isPending}
              onClick={() => openSettingsMutation.mutate()}
            >
              Open settings
            </Button>
            <Button size="sm" variant="outline" disabled={isFetching} onClick={checkAgain}>
              Check again
            </Button>
          </div>
        </div>
      )}

      <div>
        <DeleteSmsTransactionsButton />
      </div>
    </SectionCard>
  )
}
