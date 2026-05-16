'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import { defaultHrZones, defaultPowerZones } from '@/lib/zoneDefaults'
import { ZoneEditor } from '@/components/profile/ZoneEditor'
import { WizardShell } from '@/components/onboarding/WizardShell'
import { useCompleteOnboarding } from '@/components/onboarding/useCompleteOnboarding'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'
import type { Zone } from '@/lib/types'

interface Props {
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}

export function Step2Zones({ onNext, onBack, onSkip }: Props) {
  const t = useTranslations('onboarding')
  const tCommon = useTranslations('common')
  const { athlete, refreshAthlete } = useAuth()
  const completeOnboarding = useCompleteOnboarding()

  const [maxHr, setMaxHr] = useState(athlete?.max_hr?.toString() ?? '')
  const [ftp, setFtp] = useState(athlete?.ftp?.toString() ?? '')
  const [hrZones, setHrZones] = useState<Zone[]>(athlete?.hr_zones ?? [])
  const [powerZones, setPowerZones] = useState<Zone[]>(athlete?.power_zones ?? [])
  const [saving, setSaving] = useState(false)

  async function handleNext() {
    if (!maxHr && !ftp && hrZones.length === 0 && powerZones.length === 0) {
      onNext()
      return
    }
    setSaving(true)
    try {
      await apiFetch('/api/athlete/', {
        method: 'PUT',
        body: JSON.stringify({
          ftp: ftp ? parseInt(ftp) : null,
          max_hr: maxHr ? parseInt(maxHr) : null,
          hr_zones: hrZones.length > 0 ? hrZones : undefined,
          power_zones: powerZones.length > 0 ? powerZones : undefined,
        }),
      })
      await refreshAthlete()
      onNext()
    } catch (err) {
      toast({ title: tCommon('error'), description: err instanceof Error ? err.message : tCommon('unknownError'), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <WizardShell
      step={2}
      title={t('step2.title')}
      onNext={handleNext}
      onBack={onBack}
      onSkip={onSkip}
      onSkipAll={completeOnboarding}
      saving={saving}
    >
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">{t('step2.subtitle')}</p>

        {/* HR Zones */}
        <div className="space-y-3">
          <p className="text-sm font-medium">{t('step2.hrTitle')}</p>
          <div className="flex items-end gap-2">
            <div className="space-y-1.5 flex-1 max-w-[160px]">
              <Label htmlFor="ob-maxhr" className="text-xs text-muted-foreground">
                {t('step2.maxHr')}
              </Label>
              <Input
                id="ob-maxhr"
                type="number"
                min="100"
                max="250"
                value={maxHr}
                onChange={(e) => setMaxHr(e.target.value)}
                placeholder={t('step2.maxHrPlaceholder')}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!maxHr}
              onClick={() => setHrZones(defaultHrZones(parseInt(maxHr)))}
            >
              {t('step2.populateHr')}
            </Button>
          </div>
          {hrZones.length > 0 && (
            <ZoneEditor zones={hrZones} unit="bpm" onChange={setHrZones} />
          )}
        </div>

        {/* Power Zones */}
        <div className="space-y-3">
          <p className="text-sm font-medium">{t('step2.powerTitle')}</p>
          <div className="flex items-end gap-2">
            <div className="space-y-1.5 flex-1 max-w-[160px]">
              <Label htmlFor="ob-ftp" className="text-xs text-muted-foreground">
                {t('step2.ftp')}
              </Label>
              <Input
                id="ob-ftp"
                type="number"
                min="50"
                max="600"
                value={ftp}
                onChange={(e) => setFtp(e.target.value)}
                placeholder={t('step2.ftpPlaceholder')}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!ftp}
              onClick={() => setPowerZones(defaultPowerZones(parseInt(ftp)))}
            >
              {t('step2.populatePower')}
            </Button>
          </div>
          {powerZones.length > 0 && (
            <ZoneEditor zones={powerZones} unit="W" onChange={setPowerZones} />
          )}
        </div>
      </div>
    </WizardShell>
  )
}
