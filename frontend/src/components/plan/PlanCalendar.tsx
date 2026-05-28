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

  const handleUnlink = async (workout: PlannedWorkout) => {
    try {
      await apiFetch(`/api/plans/${workout.plan_id}/workouts/${workout.id}/link`, {
        method: 'DELETE',
      })
      const updated = { ...workout, completed_activity_id: null }
      setWorkoutsState((prev) => prev.map((w) => (w.id === workout.id ? updated : w)))
      setSelected((s) =>
        s && s.workout?.id === workout.id ? { ...s, workout: updated } : s
      )
      onWorkoutUpdated?.(updated)
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
      const updated = { ...workout, completed_activity_id: selectedActivityId }
      setWorkoutsState((prev) => prev.map((w) => (w.id === workout.id ? updated : w)))
      setSelected((s) =>
        s && s.workout?.id === workout.id ? { ...s, workout: updated } : s
      )
      onWorkoutUpdated?.(updated)
      setShowLinkPicker(false)
      toast({ title: t('plan.linkSuccess') })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('plan.linkFailed')
      toast({ title: msg, variant: 'destructive' })
    } finally {
      setLinking(false)
    }
  }

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setSelected(null)
      setShowLinkPicker(false)
      setSelectedActivityId('')
      setActivities([])
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
                <WorkoutCard workout={selected.workout} onUnlink={handleUnlink} />

                {selected.workout.completed_activity_id == null && (
                  <div className="space-y-2">
                    {!showLinkPicker ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => openLinkPicker(selected.date)}
                      >
                        {t('plan.markAsCompleted')}
                      </Button>
                    ) : (
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
