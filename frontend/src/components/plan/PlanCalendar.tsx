'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { TrainingPlan, PlannedWorkout, Activity } from '@/lib/types'
import { WorkoutCard } from './WorkoutCard'
import { addDays, format } from 'date-fns'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch } from '@/lib/api'
import { toast } from '@/components/ui/use-toast'

interface Props {
  plan: TrainingPlan
  currentWeek?: number
  onWorkoutUpdated?: (workout: PlannedWorkout) => void
}

interface SelectedDay {
  workout: PlannedWorkout | null
  label: string
  dateStr: string
  /** ISO date string yyyy-MM-dd for the calendar cell */
  date: string
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

interface ActivityListResponse {
  items: Activity[]
  total: number
}

const SKIP_REASON_KEYS = [
  'illness', 'injury', 'fatigue', 'busy', 'lazy', 'travel', 'weather', 'other',
] as const

export function PlanCalendar({ plan, currentWeek = 1, onWorkoutUpdated }: Props) {
  const t = useTranslations('app')
  const dayLabels = t.raw('plan.generate.dayNames') as string[]
  const [selected, setSelected] = useState<SelectedDay | null>(null)
  const [workoutsState, setWorkoutsState] = useState<PlannedWorkout[]>(plan.workouts)

  // Mark-as-completed state
  const [activities, setActivities] = useState<Activity[]>([])
  const [loadingActivities, setLoadingActivities] = useState(false)
  const [selectedActivityId, setSelectedActivityId] = useState<string>('')
  const [linking, setLinking] = useState(false)
  const [showLinkPicker, setShowLinkPicker] = useState(false)

  // Skip flow state
  const [showSkipForm, setShowSkipForm] = useState(false)
  const [selectedSkipKey, setSelectedSkipKey] = useState<string>('')
  const [customReason, setCustomReason] = useState('')
  const [skipping, setSkipping] = useState(false)

  const _updateWorkout = (updated: PlannedWorkout) => {
    setWorkoutsState((prev) => prev.map((w) => (w.id === updated.id ? updated : w)))
    setSelected((s) => s && s.workout?.id === updated.id ? { ...s, workout: updated } : s)
    onWorkoutUpdated?.(updated)
  }

  const handleUnlink = async (workout: PlannedWorkout) => {
    try {
      await apiFetch(`/api/plans/${workout.plan_id}/workouts/${workout.id}/link`, {
        method: 'DELETE',
      })
      _updateWorkout({ ...workout, completed_activity_id: null })
      toast({ title: t('plan.unlinkSuccess') })
    } catch {
      toast({ title: t('plan.unlinkFailed'), variant: 'destructive' })
    }
  }

  const openLinkPicker = async (date: string) => {
    setShowLinkPicker(true)
    setSelectedActivityId('')
    setLoadingActivities(true)
    try {
      const data = await apiFetch<ActivityListResponse>(
        `/api/activities/?start=${date}&end=${date}&page_size=50`
      )
      setActivities(data.items ?? [])
    } catch {
      setActivities([])
    } finally {
      setLoadingActivities(false)
    }
  }

  const handleLink = async () => {
    if (!selected?.workout || !selectedActivityId) return
    const workout = selected.workout
    setLinking(true)
    try {
      await apiFetch(`/api/plans/${workout.plan_id}/workouts/${workout.id}/link`, {
        method: 'PUT',
        body: JSON.stringify({ activity_id: selectedActivityId }),
      })
      _updateWorkout({ ...workout, completed_activity_id: selectedActivityId })
      setShowLinkPicker(false)
      toast({ title: t('plan.linkSuccess') })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('plan.linkFailed')
      toast({ title: msg, variant: 'destructive' })
    } finally {
      setLinking(false)
    }
  }

  const handleSkip = async () => {
    if (!selected?.workout || !selectedSkipKey) return
    const workout = selected.workout
    const reason = selectedSkipKey === 'other'
      ? (customReason.trim() || t('plan.skipReasons.other' as never))
      : t(`plan.skipReasons.${selectedSkipKey}` as never)

    setSkipping(true)
    try {
      await apiFetch(`/api/plans/${workout.plan_id}/workouts/${workout.id}/skip`, {
        method: 'PUT',
        body: JSON.stringify({ reason }),
      })
      _updateWorkout({ ...workout, skip_reason: reason })
      setShowSkipForm(false)
      setSelectedSkipKey('')
      setCustomReason('')
      toast({ title: t('plan.skipSuccess') })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('plan.skipFailed')
      toast({ title: msg, variant: 'destructive' })
    } finally {
      setSkipping(false)
    }
  }

  const handleClearSkip = async (workout: PlannedWorkout) => {
    try {
      await apiFetch(`/api/plans/${workout.plan_id}/workouts/${workout.id}/skip`, {
        method: 'DELETE',
      })
      _updateWorkout({ ...workout, skip_reason: null })
      toast({ title: t('plan.clearSkipSuccess') })
    } catch {
      toast({ title: t('plan.clearSkipFailed'), variant: 'destructive' })
    }
  }

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setSelected(null)
      setShowLinkPicker(false)
      setSelectedActivityId('')
      setActivities([])
      setShowSkipForm(false)
      setSelectedSkipKey('')
      setCustomReason('')
    }
  }

  // Group workouts by week
  const weeks = new Map<number, typeof workoutsState>()
  for (const w of workoutsState) {
    if (!weeks.has(w.week_number)) weeks.set(w.week_number, [])
    weeks.get(w.week_number)!.push(w)
  }

  const weekNums = Array.from(weeks.keys()).sort((a, b) => a - b)

  return (
    <>
      <div className="space-y-6">
        {weekNums.map((wn) => {
          const workouts = weeks.get(wn)!
          const byDay = new Map(workouts.map((w) => [w.day_of_week, w]))

          const planStart = new Date(plan.start_date)
          const weekStart = addDays(planStart, (wn - 1) * 7)

          return (
            <div key={wn}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {t('plan.weekLabel', { week: wn, date: format(weekStart, 'MMM d') })}
                {wn === currentWeek && (
                  <span className="ml-2 text-primary">{t('plan.current')}</span>
                )}
              </p>
              <div className="grid grid-cols-7 gap-1">
                {dayLabels.map((label, idx) => {
                  const dayNum = idx + 1 // 1=Mon
                  const workout = byDay.get(dayNum)
                  const date = addDays(weekStart, idx)
                  return (
                    <button
                      key={dayNum}
                      className="min-h-[64px] text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      onClick={() => {
                        setShowLinkPicker(false)
                        setSelectedActivityId('')
                        setActivities([])
                        setShowSkipForm(false)
                        setSelectedSkipKey('')
                        setCustomReason('')
                        setSelected({
                          workout: workout ?? null,
                          label,
                          dateStr: format(date, 'MMM d'),
                          date: format(date, 'yyyy-MM-dd'),
                        })
                      }}
                    >
                      <p className="text-xs text-muted-foreground mb-1">
                        {label}
                        <span className="ml-1 opacity-60">{format(date, 'd')}</span>
                      </p>
                      {workout ? (
                        <WorkoutCard workout={workout} compact />
                      ) : (
                        <div className="rounded px-2 py-1 text-xs text-muted-foreground/40 bg-muted/30">
                          {t('plan.rest')}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <Dialog open={selected !== null} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              {selected?.label}
              {selected?.dateStr && (
                <span className="ml-2 text-muted-foreground font-normal">{selected.dateStr}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="pt-1 space-y-3">
            {selected?.workout ? (
              <>
                <WorkoutCard
                  workout={selected.workout}
                  onUnlink={handleUnlink}
                  onClearSkip={handleClearSkip}
                />

                {/* Action buttons — only when not yet completed and not skipped */}
                {selected.workout.completed_activity_id == null &&
                  selected.workout.skip_reason == null && (
                  <div className="space-y-2">
                    {!showLinkPicker && !showSkipForm ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => openLinkPicker(selected.date)}
                        >
                          {t('plan.markAsCompleted')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => setShowSkipForm(true)}
                        >
                          {t('plan.skip')}
                        </Button>
                      </>
                    ) : showLinkPicker ? (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">{t('plan.selectActivity')}</p>
                        {loadingActivities ? (
                          <p className="text-xs text-muted-foreground">{t('plan.loadingActivities')}</p>
                        ) : activities.length === 0 ? (
                          <p className="text-xs text-muted-foreground">{t('plan.noActivitiesOnDay')}</p>
                        ) : (
                          <Select value={selectedActivityId} onValueChange={setSelectedActivityId}>
                            <SelectTrigger className="text-xs h-8">
                              <SelectValue placeholder={t('plan.chooseActivity')} />
                            </SelectTrigger>
                            <SelectContent>
                              {activities.map((a) => (
                                <SelectItem key={a.id} value={a.id} className="text-xs">
                                  {a.name || a.sport_type}
                                  {a.duration_s ? ` · ${formatDuration(a.duration_s)}` : ''}
                                  {a.tss != null ? ` · ${Math.round(a.tss)} TSS` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 text-xs"
                            disabled={!selectedActivityId || linking}
                            onClick={handleLink}
                          >
                            {linking ? t('plan.linking') : t('plan.confirmLink')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => {
                              setShowLinkPicker(false)
                              setSelectedActivityId('')
                            }}
                          >
                            {t('plan.unlinkCancel')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-foreground">{t('plan.skipTitle')}</p>
                        <Select value={selectedSkipKey} onValueChange={setSelectedSkipKey}>
                          <SelectTrigger className="w-full text-xs h-9">
                            <SelectValue placeholder={t('plan.skipTitle')} />
                          </SelectTrigger>
                          <SelectContent>
                            {SKIP_REASON_KEYS.map((key) => (
                              <SelectItem key={key} value={key} className="text-xs">
                                {t(`plan.skipReasons.${key}` as never)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedSkipKey === 'other' && (
                          <Textarea
                            className="text-xs resize-none"
                            rows={2}
                            placeholder={t('plan.skipReasonPlaceholder')}
                            value={customReason}
                            onChange={(e) => setCustomReason(e.target.value)}
                          />
                        )}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 text-xs"
                            disabled={!selectedSkipKey || skipping || (selectedSkipKey === 'other' && !customReason.trim())}
                            onClick={handleSkip}
                          >
                            {skipping ? '…' : t('plan.skipConfirm')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => {
                              setShowSkipForm(false)
                              setSelectedSkipKey('')
                              setCustomReason('')
                            }}
                          >
                            {t('plan.unlinkCancel')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t('plan.rest')}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
