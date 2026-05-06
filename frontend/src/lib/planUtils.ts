import { addDays, startOfWeek, format } from 'date-fns'
import type { TrainingPlan } from './types'

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
