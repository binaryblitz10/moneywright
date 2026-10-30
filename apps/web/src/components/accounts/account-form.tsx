import { useState, useMemo } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select'
import { createAccount, updateAccount, type Account, type AccountType } from '@/lib/api'
import { useConstants } from '@/hooks'

interface AccountFormProps {
  account: Account | null
  profileId: string
  accountTypes: AccountType[]
  onClose: () => void
  onSuccess: () => void
}

export function AccountForm({
  account,
  profileId,
  accountTypes,
  onClose,
  onSuccess,
}: AccountFormProps) {
  const [type, setType] = useState(account?.type || '')
  const [institution, setInstitution] = useState(account?.institution || '')
  const [accountName, setAccountName] = useState(account?.accountName || '')
  const [productName, setProductName] = useState(account?.productName || '')
  const [categorizationHints, setCategorizationHints] = useState(account?.categorizationHints || '')
  const [accountNumber, setAccountNumber] = useState('')
  const [currency, setCurrency] = useState(account?.currency || 'INR')
  const [isActive, setIsActive] = useState(account?.isActive ?? true)

  // Get institutions from constants
  const { rawInstitutions } = useConstants()

  // Filter and sort institutions
  const sortedInstitutions = useMemo(() => {
    if (!rawInstitutions.length) return []
    return [...rawInstitutions].sort((a, b) => a.name.localeCompare(b.name))
  }, [rawInstitutions])

  const institutionOptions = useMemo<SearchableSelectOption[]>(
    () =>
      sortedInstitutions.map((inst) => ({
        value: inst.id,
        label: inst.name,
        icon: (
          <img
            src={inst.logo}
            alt=""
            className="h-4 w-4 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ),
      })),
    [sortedInstitutions]
  )

  const createMutation = useMutation({
    mutationFn: createAccount,
    onSuccess: () => {
      toast.success('Account created')
      onSuccess()
    },
    onError: () => {
      toast.error('Failed to create account')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof updateAccount>[1]) => updateAccount(account!.id, data),
    onSuccess: () => {
      toast.success('Account updated')
      onSuccess()
    },
    onError: () => {
      toast.error('Failed to update account')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!type) {
      toast.error('Please select an account type')
      return
    }

    if (account) {
      updateMutation.mutate({
        accountName: accountName || undefined,
        productName: productName || null,
        institution: institution || null,
        categorizationHints: categorizationHints.trim() || null,
        isActive,
      })
    } else {
      createMutation.mutate({
        profileId,
        type,
        currency,
        institution: institution || null,
        accountNumber: accountNumber || null,
        accountName: accountName || null,
      })
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending
  const isEditMode = !!account

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditMode ? 'Edit Account' : 'Add Account'}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update your account details below.'
              : 'Add a new financial account to track.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Account Type & Currency - only editable when creating */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="type">Account Type *</Label>
              <Select value={type} onValueChange={setType} disabled={isEditMode}>
                <SelectTrigger id="type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {accountTypes.map((t) => (
                    <SelectItem key={t.code} value={t.code}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Currency *</Label>
              <Select value={currency} onValueChange={setCurrency} disabled={isEditMode}>
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INR">INR - Indian Rupee</SelectItem>
                  <SelectItem value="USD">USD - US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                  <SelectItem value="GBP">GBP - British Pound</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Institution Dropdown */}
          <div className="space-y-2">
            <Label>Institution / Bank</Label>
            <SearchableSelect
              value={institution}
              onChange={setInstitution}
              options={institutionOptions}
              placeholder="Select institution..."
              searchPlaceholder="Search institution..."
              emptyLabel="No institution found."
              noneLabel="None / Other"
              triggerClassName="bg-background border-input hover:bg-background hover:border-border-hover"
              fallbackLabel={institution || undefined}
              fallbackIcon={<Building2 className="h-4 w-4 text-muted-foreground" />}
            />
          </div>

          {/* Account Name */}
          <div className="space-y-2">
            <Label htmlFor="accountName">Account Name</Label>
            <Input
              id="accountName"
              placeholder="e.g., Primary Savings, Travel Card"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              A friendly name to identify this account
            </p>
          </div>

          {/* Product Name */}
          <div className="space-y-2">
            <Label htmlFor="productName">Product Name</Label>
            <Input
              id="productName"
              placeholder="e.g., Regalia, Platinum Travel, Savings Max"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">The specific product or card variant</p>
          </div>

          {/* Categorization Hints - only when editing */}
          {isEditMode && (
            <div className="space-y-2">
              <Label htmlFor="categorizationHints">Categorization Hints</Label>
              <Textarea
                id="categorizationHints"
                placeholder="E.g., Transfers to Rahul are rent, FX transactions are investments"
                value={categorizationHints}
                onChange={(e) => setCategorizationHints(e.target.value.slice(0, 1000))}
                className="min-h-[80px] resize-none"
                maxLength={1000}
              />
              <p className="text-xs text-muted-foreground">
                Applied automatically whenever transactions from this account are categorized.
              </p>
            </div>
          )}

          {/* Account Number - only when creating */}
          {!isEditMode && (
            <div className="space-y-2">
              <Label htmlFor="accountNumber">Account Number (Optional)</Label>
              <Input
                id="accountNumber"
                placeholder="Will be encrypted"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Your account number is encrypted and stored securely
              </p>
            </div>
          )}

          {/* Active Status - only when editing */}
          {isEditMode && (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="isActive" className="font-medium">
                  Account Active
                </Label>
                <p className="text-sm text-muted-foreground">
                  Inactive accounts are hidden from most views
                </p>
              </div>
              <Switch id="isActive" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEditMode ? 'Saving...' : 'Creating...'}
                </>
              ) : isEditMode ? (
                'Save Changes'
              ) : (
                'Create Account'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
