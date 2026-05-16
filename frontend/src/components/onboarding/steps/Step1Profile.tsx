'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import { WizardShell } from '@/components/onboarding/WizardShell'
import { useCompleteOnboarding } from '@/components/onboarding/useCompleteOnboarding'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'

interface Props {
  onNext: () => void
  onSkip: () => void
}

export function Step1Profile({ onNext, onSkip }: Props) {
  const t = useTranslations('onboarding')
  const tCommon = useTranslations('common')
  const { athlete, refreshAthlete } = useAuth()
  const completeOnboarding = useCompleteOnboarding()
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(athlete?.name ?? '')
  const [weight, setWeight] = useState(athlete?.weight_kg?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [removingAvatar, setRemovingAvatar] = useState(false)

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    try {
      const form = new FormData()
      form.append('file', file)
      await apiFetch('/api/athlete/avatar', { method: 'POST', body: form })
      await refreshAthlete()
    } catch (err) {
      toast({ title: tCommon('error'), description: err instanceof Error ? err.message : tCommon('unknownError'), variant: 'destructive' })
    } finally {
      setUploadingAvatar(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  async function handleRemoveAvatar() {
    setRemovingAvatar(true)
    try {
      await apiFetch('/api/athlete/avatar', { method: 'DELETE' })
      await refreshAthlete()
    } catch (err) {
      toast({ title: tCommon('error'), description: err instanceof Error ? err.message : tCommon('unknownError'), variant: 'destructive' })
    } finally {
      setRemovingAvatar(false)
    }
  }

  async function handleNext() {
    if (!name && !weight) {
      onNext()
      return
    }
    setSaving(true)
    try {
      await apiFetch('/api/athlete/', {
        method: 'PUT',
        body: JSON.stringify({
          name: name || null,
          weight_kg: weight ? parseFloat(weight) : null,
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
      step={1}
      title={t('step1.title')}
      onNext={handleNext}
      onSkip={onSkip}
      onSkipAll={completeOnboarding}
      saving={saving}
    >
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">{t('step1.subtitle')}</p>

        {/* Avatar */}
        <div className="space-y-2">
          <Label>{t('step1.picture')}</Label>
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 shrink-0 rounded-full overflow-hidden bg-muted border">
              {athlete?.avatar_url ? (
                <Image src={athlete.avatar_url} alt="" fill className="object-cover" unoptimized />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xl font-semibold text-muted-foreground select-none">
                  {name ? name.charAt(0).toUpperCase() : '?'}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <Button type="button" variant="outline" size="sm" disabled={uploadingAvatar} onClick={() => avatarInputRef.current?.click()}>
                {uploadingAvatar ? '…' : t('step1.uploadPicture')}
              </Button>
              {athlete?.avatar_url && (
                <Button type="button" variant="ghost" size="sm" disabled={removingAvatar} className="text-destructive hover:text-destructive" onClick={handleRemoveAvatar}>
                  {removingAvatar ? '…' : t('step1.removePicture')}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="ob-name">{t('step1.name')}</Label>
          <Input
            id="ob-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('step1.namePlaceholder')}
          />
        </div>

        {/* Weight */}
        <div className="space-y-2">
          <Label htmlFor="ob-weight">{t('step1.weight')}</Label>
          <Input
            id="ob-weight"
            type="number"
            min="20"
            max="300"
            step="0.1"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder={t('step1.weightPlaceholder')}
            className="max-w-[140px]"
          />
        </div>
      </div>
    </WizardShell>
  )
}
