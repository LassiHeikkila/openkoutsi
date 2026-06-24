import { addDays, startOfWeek, format } from 'date-fns'
import type { PlannedWorkout, TrainingPlan } from './types'

/** Computes the calendar Date of a planned workout.
 *  day_of_week: 1=Monday … 7=Sunday (matches backend schema) */
export function workoutDate(planStartDate: string, weekNumber: number, dayOfWeek: number): Date {
  const base = new Date(planStartDate)
  return addDays(base, (weekNumber - 1) * 7 + (dayOfWeek - 1))
}

/** Returns 'yyyy-MM-dd' of the Monday of the ISO week containing `date`. */
export function weekKey(date: Date): string {
  return format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd')
}

/**
 * Aggregates target_tss from active plans into a Map of weekKey → total planned TSS.
 * Plans with status !== 'active' and workouts with null target_tss are skipped.
 */
export function aggregatePlannedTssByWeek(plans: TrainingPlan[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const plan of plans) {
    if (plan.status !== 'active') continue
    for (const workout of plan.workouts) {
      if (workout.target_tss == null) continue
      const date = workoutDate(plan.start_date, workout.week_number, workout.day_of_week)
      const key = weekKey(date)
      map.set(key, (map.get(key) ?? 0) + workout.target_tss)
    }
  }
  return map
}

export type PlannedWorkoutStatus = 'completed' | 'skipped' | 'planned'

/** Derives the status of a planned workout.
 *  A linked completed activity takes precedence over a skip reason. */
export function plannedWorkoutStatus(workout: PlannedWorkout): PlannedWorkoutStatus {
  if (workout.completed_activity_id != null) return 'completed'
  if (workout.skip_reason != null) return 'skipped'
  return 'planned'
}

/** Editable workout fields as held in form state (all strings for inputs). */
export interface WorkoutFormValues {
  workout_type: string
  description: string
  duration_min: string
  target_tss: string
}

/** Converts a workout edit/add form's string values into an API payload,
 *  coercing blank numeric inputs to null. */
export function workoutFormToPayload(values: WorkoutFormValues): {
  workout_type: string
  description: string | null
  duration_min: number | null
  target_tss: number | null
} {
  const toInt = (s: string): number | null => {
    const trimmed = s.trim()
    if (trimmed === '') return null
    const n = parseInt(trimmed, 10)
    return Number.isNaN(n) ? null : n
  }
  return {
    workout_type: values.workout_type,
    description: values.description.trim() || null,
    duration_min: toInt(values.duration_min),
    target_tss: toInt(values.target_tss),
  }
}

/** Groups workouts of the active plan by date key (yyyy-MM-dd). */
export function groupPlannedWorkoutsByDate(plan: TrainingPlan | undefined): Map<string, PlannedWorkout[]> {
  const map = new Map<string, PlannedWorkout[]>()
  if (!plan || plan.status !== 'active') return map

  for (const workout of plan.workouts) {
    if (workout.workout_type === 'rest') continue
    const key = format(workoutDate(plan.start_date, workout.week_number, workout.day_of_week), 'yyyy-MM-dd')
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(workout)
  }

  return map
}
