'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import { WizardShell } from '@/components/onboarding/WizardShell'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
  const [declined, setDeclined] = useState(false)

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

  const dataItems = t.raw('consent.dataItems') as Record<string, string>

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

        {declined && (
          <p className="text-sm text-muted-foreground border rounded-md p-3 bg-muted/20">
            {t('consent.declineNote')}
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDeclined(true)
              logout()
            }}
          >
            {t('consent.decline')}
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
