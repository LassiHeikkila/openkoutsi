'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { useTranslations } from 'next-intl'
import { fetcher, apiFetch } from '@/lib/api'
import type { AthleteProfile, TrainingPlan } from '@/lib/types'
import { getLlmConfig, generatePlanWeeks } from '@/lib/llm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { PlanCalendar } from '@/components/plan/PlanCalendar'
import {
  PlanStructureFields,
  DEFAULT_DAY_TYPES,
} from '@/components/plan/PlanStructureFields'
import { toast } from '@/components/ui/use-toast'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Plus, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { differenceInWeeks } from 'date-fns'

interface PlanStructureState {
  selectedDays: Set<number>
  setSelectedDays: (updater: (prev: Set<number>) => Set<number>) => void
  dayTypes: Record<number, string>
  setDayTypes: (updater: (prev: Record<number, string>) => Record<number, string>) => void
}

/** Shared toggle: add/remove a training day and seed a default type for new days. */
function toggleDayIn(
  day: number,
  setSelectedDays: PlanStructureState['setSelectedDays'],
  dayTypes: Record<number, string>,
  setDayTypes: PlanStructureState['setDayTypes'],
) {
  setSelectedDays((prev) => {
    const next = new Set(prev)
    if (next.has(day)) {
      next.delete(day)
    } else {
      next.add(day)
      if (!dayTypes[day]) {
        setDayTypes((t) => ({ ...t, [day]: 'recovery' }))
      }
    }
    return next
  })
}

function GeneratePlanDialog({
  onGenerated,
  athlete,
}: {
  onGenerated: () => void
  athlete: AthleteProfile | undefined
}) {
  const t = useTranslations('app')
  const tCommon = useTranslations('common')
  const llmConfig = getLlmConfig(athlete?.app_settings)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)

  // Step 1 state
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [weeks, setWeeks] = useState('8')
  const [goal, setGoal] = useState('')
  const [useLlm, setUseLlm] = useState(false)

  // Step 2 state
  const [selectedDays, setSelectedDays] = useState<Set<number>>(
    new Set([2, 4, 6, 7]),
  )
  const [dayTypes, setDayTypes] = useState<Record<number, string>>(DEFAULT_DAY_TYPES)
  const [periodization, setPeriodization] = useState('base_building')
  const [intensityPref, setIntensityPref] = useState('moderate')
  const [longDescription, setLongDescription] = useState('')
  const [generating, setGenerating] = useState(false)

  function resetDialog() {
    setStep(1)
    setName('')
    setStartDate('')
    setWeeks('8')
    setGoal('')
    setUseLlm(false)
    setSelectedDays(new Set([2, 4, 6, 7]))
    setDayTypes(DEFAULT_DAY_TYPES)
    setPeriodization('base_building')
    setIntensityPref('moderate')
    setLongDescription('')
  }

  async function handleSubmit() {
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
        const llmWeeks = await generatePlanWeeks(
          config,
          numWeeks,
          goal || null,
          athlete,
        )
        await apiFetch('/api/plans/', {
          method: 'POST',
          body: JSON.stringify({
            name,
            start_date: startDate,
            weeks: numWeeks,
            goal: goal || null,
            config,
            llm_weeks: llmWeeks,
          }),
        })
      } else {
        await apiFetch('/api/plans/', {
          method: 'POST',
          body: JSON.stringify({
            name,
            start_date: startDate,
            weeks: numWeeks,
            goal: goal || null,
            config,
            use_llm: useLlm,
          }),
        })
      }

      toast({ title: t('plan.generate.success') })
      setOpen(false)
      resetDialog()
      onGenerated()
    } catch (err) {
      toast({
        title: tCommon('error'),
        description: err instanceof Error ? err.message : tCommon('unknownError'),
        variant: 'destructive',
      })
    } finally {
      setGenerating(false)
    }
  }

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) resetDialog()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          {t('plan.generatePlan')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? t('plan.generate.step1Title') : t('plan.generate.step2Title')}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="plan-name">{t('plan.generate.planName')}</Label>
              <Input
                id="plan-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('plan.generate.planNamePlaceholder')}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="plan-start">{t('plan.generate.startDate')}</Label>
                <Input
                  id="plan-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-weeks">{t('plan.generate.weeks')}</Label>
                <Input
                  id="plan-weeks"
                  type="number"
                  min="2"
                  max="52"
                  value={weeks}
                  onChange={(e) => setWeeks(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-goal">{t('plan.generate.goalEvent')}</Label>
              <Input
                id="plan-goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={t('plan.generate.goalEventPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('plan.generate.method')}</Label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setUseLlm(false)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm text-left transition-colors ${
                    !useLlm
                      ? 'border-primary bg-primary/5 text-primary font-medium'
                      : 'border-input text-muted-foreground hover:border-muted-foreground'
                  }`}
                >
                  <div className="font-medium">{t('plan.generate.structured')}</div>
                  <div className="text-xs mt-0.5 opacity-70">{t('plan.generate.structuredDesc')}</div>
                </button>
                <button
                  type="button"
                  onClick={() => setUseLlm(true)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm text-left transition-colors ${
                    useLlm
                      ? 'border-primary bg-primary/5 text-primary font-medium'
                      : 'border-input text-muted-foreground hover:border-muted-foreground'
                  }`}
                >
                  <div className="font-medium">{t('plan.generate.aiGenerated')}</div>
                  <div className="text-xs mt-0.5 opacity-70">
                    {llmConfig ? t('plan.generate.aiDescBrowser') : t('plan.generate.aiDescServer')}
                  </div>
                </button>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                onClick={() => setStep(2)}
                disabled={!name || !startDate}
              >
                {t('plan.generate.next')}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 mt-2">
            <PlanStructureFields
              selectedDays={selectedDays}
              onToggleDay={(d) => toggleDayIn(d, setSelectedDays, dayTypes, setDayTypes)}
              dayTypes={dayTypes}
              onDayTypeChange={(d, v) => setDayTypes((t) => ({ ...t, [d]: v }))}
              periodization={periodization}
              onPeriodizationChange={setPeriodization}
              intensityPref={intensityPref}
              onIntensityChange={setIntensityPref}
              useLlm={useLlm}
              longDescription={longDescription}
              onLongDescriptionChange={setLongDescription}
            />

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                disabled={generating}
              >
                {t('plan.generate.back')}
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={generating || selectedDays.size === 0}
              >
                {generating
                  ? t('plan.generate.generating')
                  : useLlm
                  ? t('plan.generate.generateWithAi')
                  : t('plan.generate.generate')}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditPlanDialog({
  plan,
  onSaved,
}: {
  plan: TrainingPlan
  onSaved: () => void
}) {
  const t = useTranslations('app')
  const tCommon = useTranslations('common')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(plan.name)
  const [goal, setGoal] = useState(plan.goal ?? '')
  const [startDate, setStartDate] = useState(plan.start_date)
  const [weeks, setWeeks] = useState(String(plan.weeks ?? ''))
  const [saving, setSaving] = useState(false)

  function reset() {
    setName(plan.name)
    setGoal(plan.goal ?? '')
    setStartDate(plan.start_date)
    setWeeks(String(plan.weeks ?? ''))
  }

  const dirty =
    name !== plan.name ||
    goal !== (plan.goal ?? '') ||
    startDate !== plan.start_date ||
    weeks !== String(plan.weeks ?? '')

  async function handleSave() {
    setSaving(true)
    try {
      await apiFetch(`/api/plans/${plan.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name,
          goal: goal || null,
          start_date: startDate,
          weeks: parseInt(weeks),
        }),
      })
      toast({ title: t('plan.edit.success') })
      setOpen(false)
      onSaved()
    } catch (err) {
      toast({
        title: tCommon('error'),
        description: err instanceof Error ? err.message : tCommon('unknownError'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) reset()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t('plan.edit.button')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('plan.edit.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="edit-name">{t('plan.generate.planName')}</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-start">{t('plan.generate.startDate')}</Label>
              <Input
                id="edit-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-weeks">{t('plan.generate.weeks')}</Label>
              <Input
                id="edit-weeks"
                type="number"
                min="1"
                max="52"
                value={weeks}
                onChange={(e) => setWeeks(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-goal">{t('plan.generate.goalEvent')}</Label>
            <Input id="edit-goal" value={goal} onChange={(e) => setGoal(e.target.value)} />
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={!dirty || !name || !weeks || saving}>
              {saving ? t('plan.edit.saving') : tCommon('save')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RegeneratePlanDialog({
  plan,
  athlete,
  onRegenerated,
}: {
  plan: TrainingPlan
  athlete: AthleteProfile | undefined
  onRegenerated: () => void
}) {
  const t = useTranslations('app')
  const tCommon = useTranslations('common')
  const llmConfig = getLlmConfig(athlete?.app_settings)
  const [open, setOpen] = useState(false)
  const [useLlm, setUseLlm] = useState(plan.generation_method === 'llm')
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set([2, 4, 6, 7]))
  const [dayTypes, setDayTypes] = useState<Record<number, string>>(DEFAULT_DAY_TYPES)
  const [periodization, setPeriodization] = useState('base_building')
  const [intensityPref, setIntensityPref] = useState('moderate')
  const [longDescription, setLongDescription] = useState('')
  const [generating, setGenerating] = useState(false)

  // Prefill structure from the plan's existing config when the dialog opens.
  useEffect(() => {
    if (!open) return
    const cfg = plan.config as
      | {
          day_configs?: Array<{ day_of_week: number; workout_type: string }>
          periodization?: string
          intensity_preference?: string
          long_description?: string
        }
      | null
    if (!cfg) return
    if (Array.isArray(cfg.day_configs) && cfg.day_configs.length > 0) {
      setSelectedDays(new Set(cfg.day_configs.map((d) => d.day_of_week)))
      setDayTypes(
        Object.fromEntries(cfg.day_configs.map((d) => [d.day_of_week, d.workout_type])),
      )
    }
    if (cfg.periodization) setPeriodization(cfg.periodization)
    if (cfg.intensity_preference) setIntensityPref(cfg.intensity_preference)
    if (cfg.long_description) setLongDescription(cfg.long_description)
  }, [open, plan.config])

  async function handleRegenerate() {
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
      const numWeeks = plan.weeks ?? 8

      if (useLlm && llmConfig && athlete) {
        const llmWeeks = await generatePlanWeeks(config, numWeeks, plan.goal ?? null, athlete)
        await apiFetch(`/api/plans/${plan.id}/regenerate`, {
          method: 'POST',
          body: JSON.stringify({ config, llm_weeks: llmWeeks }),
        })
      } else {
        await apiFetch(`/api/plans/${plan.id}/regenerate`, {
          method: 'POST',
          body: JSON.stringify({ config, use_llm: useLlm }),
        })
      }

      toast({ title: t('plan.regenerate.success') })
      setOpen(false)
      onRegenerated()
    } catch (err) {
      toast({
        title: tCommon('error'),
        description: err instanceof Error ? err.message : tCommon('unknownError'),
        variant: 'destructive',
      })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t('plan.regenerate.button')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('plan.regenerate.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>{t('plan.generate.method')}</Label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setUseLlm(false)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm text-left transition-colors ${
                  !useLlm
                    ? 'border-primary bg-primary/5 text-primary font-medium'
                    : 'border-input text-muted-foreground hover:border-muted-foreground'
                }`}
              >
                <div className="font-medium">{t('plan.generate.structured')}</div>
                <div className="text-xs mt-0.5 opacity-70">{t('plan.generate.structuredDesc')}</div>
              </button>
              <button
                type="button"
                onClick={() => setUseLlm(true)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm text-left transition-colors ${
                  useLlm
                    ? 'border-primary bg-primary/5 text-primary font-medium'
                    : 'border-input text-muted-foreground hover:border-muted-foreground'
                }`}
              >
                <div className="font-medium">{t('plan.generate.aiGenerated')}</div>
                <div className="text-xs mt-0.5 opacity-70">
                  {llmConfig ? t('plan.generate.aiDescBrowser') : t('plan.generate.aiDescServer')}
                </div>
              </button>
            </div>
          </div>

          <PlanStructureFields
            selectedDays={selectedDays}
            onToggleDay={(d) => toggleDayIn(d, setSelectedDays, dayTypes, setDayTypes)}
            dayTypes={dayTypes}
            onDayTypeChange={(d, v) => setDayTypes((t) => ({ ...t, [d]: v }))}
            periodization={periodization}
            onPeriodizationChange={setPeriodization}
            intensityPref={intensityPref}
            onIntensityChange={setIntensityPref}
            useLlm={useLlm}
            longDescription={longDescription}
            onLongDescriptionChange={setLongDescription}
          />

          <DialogFooter>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={generating || selectedDays.size === 0}>
                  {generating ? t('plan.generate.generating') : t('plan.regenerate.button')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('plan.regenerate.confirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('plan.regenerate.confirmDesc')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRegenerate}>
                    {t('plan.regenerate.confirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function PlanPage() {
  const t = useTranslations('app')
  const tCommon = useTranslations('common')
  const { data: plans, mutate } = useSWR<TrainingPlan[]>('/api/plans/', fetcher)
  const { data: athlete } = useSWR<AthleteProfile>('/api/athlete/', fetcher)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const activePlan = plans?.find((p) => p.status === 'active')

  const currentWeek = activePlan
    ? Math.max(1, differenceInWeeks(new Date(), new Date(activePlan.start_date)) + 1)
    : 1

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleArchive(id: string) {
    try {
      await apiFetch(`/api/plans/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'archived' }),
      })
      await mutate()
      toast({ title: t('plan.archived') })
    } catch (err) {
      toast({
        title: tCommon('error'),
        description: err instanceof Error ? err.message : tCommon('unknownError'),
        variant: 'destructive',
      })
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/api/plans/${id}`, { method: 'DELETE' })
      await mutate()
      toast({ title: t('plan.deleted') })
    } catch (err) {
      toast({
        title: tCommon('error'),
        description: err instanceof Error ? err.message : tCommon('unknownError'),
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('plan.title')}</h1>
        <GeneratePlanDialog onGenerated={() => mutate()} athlete={athlete} />
      </div>

      {!activePlan && plans?.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t('plan.noPlans')}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {t('plan.noPlansDesc')}
            </p>
          </CardContent>
        </Card>
      )}

      {activePlan && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <CardTitle className="text-base truncate">{activePlan.name}</CardTitle>
                {activePlan.generation_method === 'llm' && (
                  <span className="text-xs rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 px-2 py-0.5 font-medium shrink-0">
                    {t('plan.aiTag')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <EditPlanDialog plan={activePlan} onSaved={() => mutate()} />
                <RegeneratePlanDialog
                  plan={activePlan}
                  athlete={athlete}
                  onRegenerated={() => mutate()}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleArchive(activePlan.id)}
                >
                  {t('plan.archive')}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <PlanCalendar
              key={`${activePlan.id}:${activePlan.workouts.map((w) => w.id).join(',')}`}
              plan={activePlan}
              currentWeek={currentWeek}
              showPushAction
              onChanged={() => mutate()}
            />
          </CardContent>
        </Card>
      )}

      {plans && plans.filter((p) => p.status !== 'active').length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            {t('plan.archivedPlans')}
          </h2>
          <div className="space-y-2">
            {plans
              .filter((p) => p.status !== 'active')
              .map((plan) => {
                const isOpen = expanded.has(plan.id)
                const planWeek = Math.max(
                  1,
                  differenceInWeeks(new Date(), new Date(plan.start_date)) + 1,
                )
                return (
                  <Card key={plan.id}>
                    <CardContent className="py-3">
                      <div className="flex items-center gap-2">
                        <button
                          className="flex-1 flex items-center justify-between text-left gap-2 min-w-0"
                          onClick={() => toggleExpanded(plan.id)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="text-sm font-medium truncate">{plan.name}</p>
                            {plan.generation_method === 'llm' && (
                              <span className="text-xs rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 px-2 py-0.5 font-medium shrink-0">
                                {t('plan.aiTag')}
                              </span>
                            )}
                          </div>
                          <span className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                            {t('plan.weeks', { count: plan.weeks ?? 0 })}
                            {isOpen
                              ? <ChevronUp className="h-3.5 w-3.5" />
                              : <ChevronDown className="h-3.5 w-3.5" />
                            }
                          </span>
                        </button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t('plan.deleteTitle')}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t('plan.deleteDesc', { name: plan.name })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => handleDelete(plan.id)}
                              >
                                {tCommon('delete')}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                      {isOpen && (
                        <div className="mt-4 border-t pt-4">
                          <PlanCalendar key={plan.id} plan={plan} currentWeek={planWeek} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
