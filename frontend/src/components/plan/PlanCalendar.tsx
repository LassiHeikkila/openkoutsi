'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { TrainingPlan, PlannedWorkout } from '@/lib/types'
import { WorkoutCard } from './WorkoutCard'
import { WorkoutActionsPanel } from './WorkoutActionsPanel'
import { WorkoutFormFields } from './WorkoutFormFields'
import { GenerateWorkoutsDialog } from './GenerateWorkoutsDialog'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api'
import { workoutFormToPayload, type WorkoutFormValues } from '@/lib/planUtils'
import { toast } from '@/components/ui/use-toast'
import { addDays, format } from 'date-fns'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface Props {
  plan: TrainingPlan
  currentWeek?: number
  onWorkoutUpdated?: (workout: PlannedWorkout) => void
  /** Called after a workout is added or deleted (e.g. to refresh server data). */
  onChanged?: () => void
  /** Show the "Generate workouts" action (only meaningful for the active plan). */
  showGenerateAction?: boolean
}

interface SelectedDay {
  workout: PlannedWorkout | null
  label: string
  dateStr: string
  /** ISO date string yyyy-MM-dd for the calendar cell */
  date: string
  weekNumber: number
  dayOfWeek: number
}

/** Inline form for adding a workout to an empty calendar day. */
function AddWorkoutPanel({
  planId,
  weekNumber,
  dayOfWeek,
  onAdded,
}: {
  planId: string
  weekNumber: number
  dayOfWeek: number
  onAdded: (workout: PlannedWorkout) => void
}) {
  const t = useTranslations('app')
  const [form, setForm] = useState<WorkoutFormValues>({
    workout_type: 'endurance', description: '', duration_min: '', target_tss: '',
  })
  const [saving, setSaving] = useState(false)

  const handleAdd = async () => {
    setSaving(true)
    try {
      const created = await apiFetch<PlannedWorkout>(`/api/plans/${planId}/workouts`, {
        method: 'POST',
        body: JSON.stringify({
          week_number: weekNumber,
          day_of_week: dayOfWeek,
          ...workoutFormToPayload(form),
        }),
      })
      onAdded(created)
      toast({ title: t('plan.addWorkout.success') })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('plan.addWorkout.failed')
      toast({ title: msg, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t('plan.addWorkout.prompt')}</p>
      <WorkoutFormFields values={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
      <Button size="sm" className="w-full text-xs" disabled={saving} onClick={handleAdd}>
        {saving ? '…' : t('plan.addWorkout.button')}
      </Button>
    </div>
  )
}

export function PlanCalendar({ plan, currentWeek = 1, onWorkoutUpdated, onChanged, showGenerateAction = false }: Props) {
  const t = useTranslations('app')
  const dayLabels = t.raw('plan.generate.dayNames') as string[]
  const [selected, setSelected] = useState<SelectedDay | null>(null)
  const [workoutsState, setWorkoutsState] = useState<PlannedWorkout[]>(plan.workouts)

  const _updateWorkout = (updated: PlannedWorkout) => {
    setWorkoutsState((prev) => prev.map((w) => (w.id === updated.id ? updated : w)))
    setSelected((s) => s && s.workout?.id === updated.id ? { ...s, workout: updated } : s)
    onWorkoutUpdated?.(updated)
  }

  const _addWorkout = (created: PlannedWorkout) => {
    setWorkoutsState((prev) => [...prev, created])
    setSelected((s) => s ? { ...s, workout: created } : s)
    onChanged?.()
  }

  const _deleteWorkout = (deleted: PlannedWorkout) => {
    setWorkoutsState((prev) => prev.filter((w) => w.id !== deleted.id))
    setSelected(null)
    onChanged?.()
  }

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setSelected(null)
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
      {showGenerateAction && (
        <div className="flex justify-end mb-3">
          <GenerateWorkoutsDialog planId={plan.id} onGenerated={onChanged} />
        </div>
      )}
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
                        setSelected({
                          workout: workout ?? null,
                          label,
                          dateStr: format(date, 'MMM d'),
                          date: format(date, 'yyyy-MM-dd'),
                          weekNumber: wn,
                          dayOfWeek: dayNum,
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
          <div className="pt-1">
            {selected?.workout ? (
              <WorkoutActionsPanel
                key={selected.workout.id}
                workout={selected.workout}
                date={selected.date}
                onWorkoutUpdated={_updateWorkout}
                onWorkoutDeleted={_deleteWorkout}
              />
            ) : selected ? (
              <AddWorkoutPanel
                planId={plan.id}
                weekNumber={selected.weekNumber}
                dayOfWeek={selected.dayOfWeek}
                onAdded={_addWorkout}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
