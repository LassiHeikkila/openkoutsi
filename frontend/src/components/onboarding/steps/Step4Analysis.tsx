'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import { WizardShell } from '@/components/onboarding/WizardShell'
import { useCompleteOnboarding } from '@/components/onboarding/useCompleteOnboarding'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/use-toast'

interface Props {
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}

export function Step4Analysis({ onNext, onBack, onSkip }: Props) {
  const t = useTranslations('onboarding')
  const tCommon = useTranslations('common')
  const { athlete, refreshAthlete } = useAuth()
  const completeOnboarding = useCompleteOnboarding()
  const [autoAnalyze, setAutoAnalyze] = useState(
    Boolean((athlete?.app_settings as Record<string, unknown>)?.auto_analyze),
  )
  const [saving, setSaving] = useState(false)

  async function handleToggle(checked: boolean) {
    setAutoAnalyze(checked)
    setSaving(true)
    try {
      const existing = (athlete?.app_settings ?? {}) as Record<string, unknown>
      await apiFetch('/api/athlete/', {
        method: 'PUT',
        body: JSON.stringify({ app_settings: { ...existing, auto_analyze: checked } }),
      })
      await refreshAthlete()
    } catch (err) {
      toast({ title: tCommon('error'), description: err instanceof Error ? err.message : tCommon('unknownError'), variant: 'destructive' })
      setAutoAnalyze(!checked)
    } finally {
      setSaving(false)
    }
  }

  return (
    <WizardShell
      step={4}
      title={t('step4.title')}
      onNext={onNext}
      onBack={onBack}
      onSkip={onSkip}
      onSkipAll={completeOnboarding}
      saving={saving}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('step4.subtitle')}</p>
        <div className="flex items-center gap-3 rounded-md border p-4">
          <Switch
            id="ob-auto-analyze"
            checked={autoAnalyze}
            onCheckedChange={handleToggle}
            disabled={saving}
          />
          <div>
            <Label htmlFor="ob-auto-analyze" className="text-sm font-medium cursor-pointer">
              {t('step4.toggle')}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t('step4.toggleDesc')}</p>
          </div>
        </div>
      </div>
    </WizardShell>
  )
}
