'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import { getLlmConfig, generatePlanWeeks } from '@/lib/llm'
import { WizardShell } from '@/components/onboarding/WizardShell'
import { useCompleteOnboarding } from '@/components/onboarding/useCompleteOnboarding'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'

const DAY_NUMBERS = [1, 2, 3, 4, 5, 6, 7]
const DEFAULT_DAY_TYPES: Record<number, string> = { 2: 'threshold', 4: 'endurance', 6: 'long', 7: 'recovery' }
const WORKOUT_TYPES = ['recovery', 'tempo', 'threshold', 'vo2max', 'endurance', 'long', 'strength', 'yoga', 'cross-training'] as const

interface Props {
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}

export function Step6Plan({ onNext, onBack, onSkip }: Props) {
  const t = useTranslations('onboarding')
  const tApp = useTranslations('app')
  const tCommon = useTranslations('common')
  const { athlete } = useAuth()
  const completeOnboarding = useCompleteOnboarding()
  const llmConfig = getLlmConfig(athlete?.app_settings)

  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [weeks, setWeeks] = useState('8')
  const [goal, setGoal] = useState('')
  const [useLlm, setUseLlm] = useState(false)
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set([2, 4, 6, 7]))
  const [dayTypes, setDayTypes] = useState<Record<number, string>>(DEFAULT_DAY_TYPES)
  const [periodization, setPeriodization] = useState('base_building')
  const [intensityPref, setIntensityPref] = useState('moderate')
  const [longDescription, setLongDescription] = useState('')
  const [generating, setGenerating] = useState(false)
  const [planCreated, setPlanCreated] = useState(false)

  const dayNames = tApp.raw('plan.generate.dayNames') as string[]
  const workoutTypes = tApp.raw('plan.generate.workoutTypes') as Record<string, string>
  const periodizationOptions = tApp.raw('plan.generate.periodizationOptions') as Record<string, string>
  const intensityOptions = tApp.raw('plan.generate.intensityOptions') as Record<string, string>

  function toggleDay(day: number) {
    setSelectedDays((prev) => {
      const next = new Set(prev)
      if (next.has(day)) {
        next.delete(day)
      } else {
        next.add(day)
        if (!dayTypes[day]) setDayTypes((d) => ({ ...d, [day]: 'recovery' }))
      }
      return next
    })
  }

  async function handleGenerate() {
    if (!name || !startDate) return
    setGenerating(true)
    try {
      const dayConfigs = [...selectedDays].map((d) => ({
        day_of_week: d,
        workout_type: dayTypes[d] ?? 'recovery',
      }))
      const config = {
        days_per_week: selectedDays.size,
        day_configs: dayConfigs,
        periodization,
        intensity_preference: intensityPref,
        long_description: useLlm && longDescription ? longDescription : undefined,
      }
      const numWeeks = parseInt(weeks)

      if (useLlm && llmConfig && athlete) {
        const llmWeeks = await generatePlanWeeks(config, numWeeks, goal || null, athlete)
        await apiFetch('/api/plans/', {
          method: 'POST',
          body: JSON.stringify({ name, start_date: startDate, weeks: numWeeks, goal: goal || null, config, llm_weeks: llmWeeks }),
        })
      } else {
        await apiFetch('/api/plans/', {
          method: 'POST',
          body: JSON.stringify({ name, start_date: startDate, weeks: numWeeks, goal: goal || null, config, use_llm: useLlm }),
        })
      }
      setPlanCreated(true)
      toast({ title: tApp('plan.generate.success') })
      onNext()
    } catch (err) {
      toast({ title: tCommon('error'), description: err instanceof Error ? err.message : tCommon('unknownError'), variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <WizardShell
      step={6}
      title={t('step6.title')}
      onNext={planCreated ? onNext : handleGenerate}
      onBack={onBack}
      onSkip={onSkip}
      onSkipAll={completeOnboarding}
      nextLabel={planCreated ? undefined : (generating ? tApp('plan.generate.generating') : tApp('plan.generate.generate'))}
      nextDisabled={!planCreated && (!name || !startDate || generating)}
      saving={generating}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('step6.subtitle')}</p>

        <div className="space-y-2">
          <Label htmlFor="ob-plan-name">{t('step6.nameLabel')}</Label>
          <Input id="ob-plan-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('step6.namePlaceholder')} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="ob-plan-start">{t('step6.startDate')}</Label>
            <Input id="ob-plan-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ob-plan-weeks">{t('step6.weeks')}</Label>
            <Input id="ob-plan-weeks" type="number" min="2" max="52" value={weeks} onChange={(e) => setWeeks(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ob-plan-goal">{t('step6.goal')}</Label>
          <Input id="ob-plan-goal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={t('step6.goalPlaceholder')} />
        </div>

        {/* Method toggle */}
        <div className="space-y-2">
          <Label>{t('step6.method')}</Label>
          <div className="flex gap-2">
            {[false, true].map((isLlm) => (
              <button
                key={String(isLlm)}
                type="button"
                onClick={() => setUseLlm(isLlm)}
                disabled={isLlm && !llmConfig}
                className={`flex-1 rounded-md border px-3 py-2 text-sm text-left transition-colors disabled:opacity-40 ${
                  useLlm === isLlm
                    ? 'border-primary bg-primary/5 text-primary font-medium'
                    : 'border-input text-muted-foreground hover:border-muted-foreground'
                }`}
              >
                {isLlm ? t('step6.methodAi') : t('step6.methodStructured')}
              </button>
            ))}
          </div>
        </div>

        {/* Training days */}
        <div className="space-y-2">
          <Label>{t('step6.trainingDays')}</Label>
          <div className="flex gap-1 flex-wrap">
            {DAY_NUMBERS.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={`h-9 w-9 rounded-md text-xs font-medium border transition-colors ${
                  selectedDays.has(d)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-input text-muted-foreground hover:border-muted-foreground'
                }`}
              >
                {dayNames[i]}
              </button>
            ))}
          </div>
          {/* Day workout types */}
          {selectedDays.size > 0 && (
            <div className="space-y-1 mt-1">
              {DAY_NUMBERS.filter((d) => selectedDays.has(d)).map((d, i) => (
                <div key={d} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-8">{dayNames[DAY_NUMBERS.indexOf(d)]}</span>
                  <Select value={dayTypes[d] ?? 'recovery'} onValueChange={(v) => setDayTypes((prev) => ({ ...prev, [d]: v }))}>
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WORKOUT_TYPES.map((wt) => (
                        <SelectItem key={wt} value={wt} className="text-xs">{workoutTypes[wt] ?? wt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>{t('step6.periodization')}</Label>
            <Select value={periodization} onValueChange={setPeriodization}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(periodizationOptions).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('step6.intensity')}</Label>
            <Select value={intensityPref} onValueChange={setIntensityPref}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(intensityOptions).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {useLlm && (
          <div className="space-y-2">
            <Label htmlFor="ob-plan-desc">{t('step6.aiDescription')}</Label>
            <textarea
              id="ob-plan-desc"
              value={longDescription}
              onChange={(e) => setLongDescription(e.target.value)}
              placeholder={t('step6.aiDescriptionPlaceholder')}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        )}
      </div>
    </WizardShell>
  )
}
