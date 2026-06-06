'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { TrainingPlan, PlannedWorkout } from '@/lib/types'
import { WorkoutCard } from './WorkoutCard'
import { WorkoutActionsPanel } from './WorkoutActionsPanel'
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
}

interface SelectedDay {
  workout: PlannedWorkout | null
  label: string
  dateStr: string
  /** ISO date string yyyy-MM-dd for the calendar cell */
  date: string
}

export function PlanCalendar({ plan, currentWeek = 1, onWorkoutUpdated }: Props) {
  const t = useTranslations('app')
  const dayLabels = t.raw('plan.generate.dayNames') as string[]
  const [selected, setSelected] = useState<SelectedDay | null>(null)
  const [workoutsState, setWorkoutsState] = useState<PlannedWorkout[]>(plan.workouts)

  const _updateWorkout = (updated: PlannedWorkout) => {
    setWorkoutsState((prev) => prev.map((w) => (w.id === updated.id ? updated : w)))
    setSelected((s) => s && s.workout?.id === updated.id ? { ...s, workout: updated } : s)
    onWorkoutUpdated?.(updated)
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
              />
            ) : (
              <p className="text-sm text-muted-foreground">{t('plan.rest')}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
