'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { apiFetch } from '@/lib/api'
import { WizardShell } from '@/components/onboarding/WizardShell'
import { useCompleteOnboarding } from '@/components/onboarding/useCompleteOnboarding'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Plus } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

interface Props {
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}

export function Step5Goals({ onNext, onBack, onSkip }: Props) {
  const t = useTranslations('onboarding')
  const tCommon = useTranslations('common')
  const completeOnboarding = useCompleteOnboarding()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [added, setAdded] = useState<string[]>([])

  async function handleAddGoal() {
    if (!title.trim()) return
    setSaving(true)
    try {
      await apiFetch('/api/goals/', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description: description || undefined,
          target_date: targetDate || undefined,
        }),
      })
      setAdded((prev) => [...prev, title])
      setTitle('')
      setDescription('')
      setTargetDate('')
      toast({ title: t('step5.goalAdded') })
    } catch (err) {
      toast({ title: tCommon('error'), description: err instanceof Error ? err.message : tCommon('unknownError'), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <WizardShell
      step={5}
      title={t('step5.title')}
      onNext={onNext}
      onBack={onBack}
      onSkip={onSkip}
      onSkipAll={completeOnboarding}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('step5.subtitle')}</p>

        {added.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {added.map((g) => (
              <Badge key={g} variant="secondary" className="gap-1.5">
                <CheckCircle2 className="h-3 w-3" />
                {g}
              </Badge>
            ))}
          </div>
        )}

        <div className="space-y-3 rounded-md border p-4">
          <div className="space-y-2">
            <Label htmlFor="ob-goal-title">{t('step5.titleLabel')}</Label>
            <Input
              id="ob-goal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('step5.titlePlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ob-goal-desc">{t('step5.description')}</Label>
            <Input
              id="ob-goal-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('step5.descriptionPlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ob-goal-date">{t('step5.targetDate')}</Label>
            <Input
              id="ob-goal-date"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="max-w-[180px]"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!title.trim() || saving}
            onClick={handleAddGoal}
            className="mt-1"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            {added.length === 0 ? t('step5.titleLabel') : t('step5.addAnother')}
          </Button>
        </div>
      </div>
    </WizardShell>
  )
}
