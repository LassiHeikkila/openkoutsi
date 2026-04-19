'use client'

import { useState } from 'react'
import useSWR from 'swr'
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

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_NUMBERS = [1, 2, 3, 4, 5, 6, 7]

const WORKOUT_TYPES = [
  { value: 'easy', label: 'Easy / Zone 2' },
  { value: 'tempo', label: 'Tempo' },
  { value: 'threshold', label: 'Threshold' },
  { value: 'vo2max', label: 'VO2max' },
  { value: 'endurance', label: 'Endurance' },
  { value: 'long', label: 'Long ride' },
  { value: 'strength', label: 'Strength' },
  { value: 'yoga', label: 'Yoga / Mobility' },
  { value: 'cross-training', label: 'Cross-training' },
]

const DEFAULT_DAY_TYPES: Record<number, string> = {
  2: 'threshold',
  4: 'endurance',
  6: 'long',
  7: 'easy',
}

function GeneratePlanDialog({
  onGenerated,
  athlete,
}: {
  onGenerated: () => void
  athlete: AthleteProfile | undefined
}) {
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

  function toggleDay(day: number) {
    setSelectedDays((prev) => {
      const next = new Set(prev)
      if (next.has(day)) {
        next.delete(day)
      } else {
        next.add(day)
        if (!dayTypes[day]) {
          setDayTypes((t) => ({ ...t, [day]: 'easy' }))
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
        workout_type: dayTypes[d] ?? 'easy',
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
        // Frontend LLM path: call LLM in the browser, then submit the pre-built weeks
        const llmWeeks = await generatePlanWeeks(
          config,
          numWeeks,
          goal || null,
          athlete,
          llmConfig,
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
        // Server-side LLM or rule-based
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

      toast({ title: 'Training plan generated!' })
      setOpen(false)
      resetDialog()
      onGenerated()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Unknown error',
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
          Generate plan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? 'Generate training plan' : 'Training structure'}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="plan-name">Plan name *</Label>
              <Input
                id="plan-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Summer base build"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="plan-start">Start date *</Label>
                <Input
                  id="plan-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan-weeks">Weeks</Label>
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
              <Label htmlFor="plan-goal">Goal / event</Label>
              <Input
                id="plan-goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Gran Fondo in June"
              />
            </div>
            <div className="space-y-2">
              <Label>Generation method</Label>
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
                  <div className="font-medium">Structured</div>
                  <div className="text-xs mt-0.5 opacity-70">Rule-based, instant</div>
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
                  <div className="font-medium">AI-generated</div>
                  <div className="text-xs mt-0.5 opacity-70">
                    {llmConfig ? 'Runs in your browser' : 'Uses server LLM'}
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
                Next: Training structure
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 mt-2">
            {/* Day picker */}
            <div className="space-y-2">
              <Label>Training days</Label>
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
                    {DAY_NAMES[i]}
                  </button>
                ))}
              </div>
            </div>

            {/* Per-day workout type */}
            {DAY_NUMBERS.filter((d) => selectedDays.has(d)).length > 0 && (
              <div className="space-y-2">
                <Label>Workout type per day</Label>
                <div className="space-y-2">
                  {DAY_NUMBERS.filter((d) => selectedDays.has(d)).map((day, _, arr) => (
                    <div key={day} className="flex items-center gap-2">
                      <span className="w-8 text-xs text-muted-foreground shrink-0">
                        {DAY_NAMES[day - 1]}
                      </span>
                      <Select
                        value={dayTypes[day] ?? 'easy'}
                        onValueChange={(v) => setDayTypes((t) => ({ ...t, [day]: v }))}
                      >
                        <SelectTrigger className="h-8 text-sm flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WORKOUT_TYPES.map((wt) => (
                            <SelectItem key={wt.value} value={wt.value}>
                              {wt.label}
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
                <Label>Periodization</Label>
                <Select value={periodization} onValueChange={setPeriodization}>
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="base_building">Base building</SelectItem>
                    <SelectItem value="race_prep">Race preparation</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Intensity</Label>
                <Select value={intensityPref} onValueChange={setIntensityPref}>
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* LLM description */}
            {useLlm && (
              <div className="space-y-2">
                <Label htmlFor="llm-desc">Describe your goals (for AI)</Label>
                <textarea
                  id="llm-desc"
                  value={longDescription}
                  onChange={(e) => setLongDescription(e.target.value)}
                  placeholder="e.g. I'm training for a 160km gran fondo in June. I've been cycling for 3 years, current FTP ~240W. I want to focus on building aerobic base first."
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
                Back
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={generating || selectedDays.size === 0}
              >
                {generating ? 'Generating…' : useLlm ? 'Generate with AI' : 'Generate'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default function PlanPage() {
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
      toast({ title: 'Plan archived' })
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/api/plans/${id}`, { method: 'DELETE' })
      await mutate()
      toast({ title: 'Plan deleted' })
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Training plan</h1>
        <GeneratePlanDialog onGenerated={() => mutate()} athlete={athlete} />
      </div>

      {!activePlan && plans?.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No training plan yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Generate a plan to see your weekly schedule here.
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
                    AI
                  </span>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleArchive(activePlan.id)}
              >
                Archive
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
            Archived plans
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
                                AI
                              </span>
                            )}
                          </div>
                          <span className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                            {plan.weeks} weeks
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
                              <AlertDialogTitle>Delete plan?</AlertDialogTitle>
                              <AlertDialogDescription>
                                &quot;{plan.name}&quot; will be permanently deleted.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => handleDelete(plan.id)}
                              >
                                Delete
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
