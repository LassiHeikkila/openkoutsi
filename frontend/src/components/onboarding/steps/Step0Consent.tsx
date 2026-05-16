'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { apiFetch, apiDownload } from '@/lib/api'
import { WizardShell } from '@/components/onboarding/WizardShell'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  onAccepted: () => void
}

export function Step0Consent({ onAccepted }: Props) {
  const t = useTranslations('onboarding')
  const { logout } = useAuth()
  const { slug } = useParams<{ slug: string }>()
  const [accepted, setAccepted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showDeclinePanel, setShowDeclinePanel] = useState(false)
  const [showDeleteForm, setShowDeleteForm] = useState(false)
  const [password, setPassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)

  async function handleAccept() {
    setSaving(true)
    try {
      await apiFetch(`/api/teams/${slug}/consent`, {
        method: 'POST',
        body: JSON.stringify({ consent_version: '1.0' }),
      })
      onAccepted()
    } finally {
      setSaving(false)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      await apiDownload('/api/athlete/export', 'openkoutsi_export.zip')
    } finally {
      setExporting(false)
    }
  }

  async function handleDeleteAccount() {
    setDeleteError('')
    setDeleting(true)
    try {
      await apiFetch(`/api/teams/${slug}/auth/account`, {
        method: 'DELETE',
        body: JSON.stringify({ password }),
      })
      logout()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t('consent.decline.deleteError'))
    } finally {
      setDeleting(false)
    }
  }

  const dataItems = t.raw('consent.dataItems') as Record<string, string>

  if (showDeclinePanel) {
    return (
      <WizardShell step={0} title={t('consent.decline.title')} hideNav>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('consent.decline.body')}</p>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={exporting}
              onClick={handleExport}
            >
              {exporting ? '…' : t('consent.decline.exportData')}
            </Button>

            {!showDeleteForm ? (
              <Button
                type="button"
                variant="outline"
                className="text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={() => setShowDeleteForm(true)}
              >
                {t('consent.decline.deleteAccount')}
              </Button>
            ) : (
              <div className="rounded-md border border-destructive/40 p-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t('consent.decline.deleteConfirmBody')}
                </p>
                <div className="space-y-1">
                  <Label htmlFor="delete-password" className="text-sm">
                    {t('consent.decline.passwordLabel')}
                  </Label>
                  <Input
                    id="delete-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                  />
                </div>
                {deleteError && (
                  <p className="text-sm text-destructive">{deleteError}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setShowDeleteForm(false); setPassword(''); setDeleteError('') }}
                  >
                    {t('consent.decline.cancelDelete')}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={!password || deleting}
                    onClick={handleDeleteAccount}
                  >
                    {deleting ? '…' : t('consent.decline.confirmDelete')}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowDeclinePanel(false)}
            >
              {t('consent.decline.goBack')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={logout}
            >
              {t('consent.decline.logOut')}
            </Button>
          </div>
        </div>
      </WizardShell>
    )
  }

  return (
    <WizardShell step={0} title={t('consent.title')} hideNav>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('consent.subtitle')}</p>

        <div className="rounded-md border bg-muted/30 p-4 space-y-2">
          <p className="text-sm font-medium">{t('consent.dataTitle')}</p>
          <ul className="space-y-1">
            {Object.values(dataItems).map((item) => (
              <li key={item} className="text-sm text-muted-foreground flex gap-2">
                <span className="mt-0.5 shrink-0">·</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-start gap-3 pt-1">
          <Checkbox
            id="consent-check"
            checked={accepted}
            onCheckedChange={(v) => setAccepted(Boolean(v))}
          />
          <Label htmlFor="consent-check" className="text-sm leading-snug cursor-pointer">
            {t('consent.checkboxLabel')}
          </Label>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowDeclinePanel(true)}
          >
            {t('consent.decline.button')}
          </Button>
          <Button
            type="button"
            disabled={!accepted || saving}
            onClick={handleAccept}
            className="flex-1"
          >
            {saving ? '…' : t('consent.accept')}
          </Button>
        </div>
      </div>
    </WizardShell>
  )
}
