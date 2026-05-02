'use client'

import { useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PlanCalendar } from '@/components/plan/PlanCalendar'
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

const DAY_NUMBERS = [1, 2, 3, 4, 5, 6, 7]

const DEFAULT_DAY_TYPES: Record<number, string> = {
  2: 'threshold',
  4: 'endurance',
  6: 'long',
  7: 'recovery',
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

  const dayNames = t.raw('plan.generate.dayNames') as string[]
  const workoutTypeKeys = ['recovery', 'tempo', 'threshold', 'vo2max', 'endurance', 'long', 'strength', 'yoga', 'cross-training'] as const

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

  function toggleDay(day: number) {
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
            {/* Day picker */}
            <div className="space-y-2">
              <Label>{t('plan.generate.trainingDays')}</Label>
              <div className="grid grid-cols-7 gap-1">
                {DAY_NUMBERS.map((day, i) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`rounded-md py-1.5 text-xs font-medium border transition-colors ${
                      selectedDays.has(day)
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input text-muted-foreground hover:border-muted-foreground'
                    }`}
                  >
                    {dayNames[i]}
                  </button>
                ))}
              </div>
            </div>

            {/* Per-day workout type */}
            {DAY_NUMBERS.filter((d) => selectedDays.has(d)).length > 0 && (
              <div className="space-y-2">
                <Label>{t('plan.generate.workoutPerDay')}</Label>
                <div className="space-y-2">
                  {DAY_NUMBERS.filter((d) => selectedDays.has(d)).map((day) => (
                    <div key={day} className="flex items-center gap-2">
                      <span className="w-8 text-xs text-muted-foreground shrink-0">
                        {dayNames[day - 1]}
                      </span>
                      <Select
                        value={dayTypes[day] ?? 'recovery'}
                        onValueChange={(v) => setDayTypes((t) => ({ ...t, [day]: v }))}
                      >
                        <SelectTrigger className="h-8 text-sm flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {workoutTypeKeys.map((key) => (
                            <SelectItem key={key} value={key}>
                              {t(`plan.generate.workoutTypes.${key}` as never)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Periodization */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('plan.generate.periodization')}</Label>
                <Select value={periodization} onValueChange={setPeriodization}>
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="base_building">{t('plan.generate.periodizationOptions.base_building')}</SelectItem>
                    <SelectItem value="race_prep">{t('plan.generate.periodizationOptions.race_prep')}</SelectItem>
                    <SelectItem value="maintenance">{t('plan.generate.periodizationOptions.maintenance')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('plan.generate.intensity')}</Label>
                <Select value={intensityPref} onValueChange={setIntensityPref}>
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t('plan.generate.intensityOptions.low')}</SelectItem>
                    <SelectItem value="moderate">{t('plan.generate.intensityOptions.moderate')}</SelectItem>
                    <SelectItem value="high">{t('plan.generate.intensityOptions.high')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* LLM description */}
            {useLlm && (
              <div className="space-y-2">
                <Label htmlFor="llm-desc">{t('plan.generate.aiDescLabel')}</Label>
                <textarea
                  id="llm-desc"
                  value={longDescription}
                  onChange={(e) => setLongDescription(e.target.value)}
                  placeholder={t('plan.generate.aiDescPlaceholder')}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}

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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{activePlan.name}</CardTitle>
                {activePlan.generation_method === 'llm' && (
                  <span className="text-xs rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 px-2 py-0.5 font-medium">
                    {t('plan.aiTag')}
                  </span>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleArchive(activePlan.id)}
              >
                {t('plan.archive')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <PlanCalendar plan={activePlan} currentWeek={currentWeek} />
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
                            {t('plan.weeks', { count: plan.weeks })}
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
                          <PlanCalendar plan={plan} currentWeek={planWeek} />
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
