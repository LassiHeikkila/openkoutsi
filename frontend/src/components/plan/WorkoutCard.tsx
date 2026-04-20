'use client'

import { useTranslations } from 'next-intl'
import type { PlannedWorkout } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const TYPE_COLORS: Record<string, string> = {
  rest: 'bg-gray-100 text-gray-600',
  easy: 'bg-blue-50 text-blue-700',
  endurance: 'bg-sky-50 text-sky-700',
  tempo: 'bg-yellow-50 text-yellow-700',
  threshold: 'bg-orange-50 text-orange-700',
  vo2max: 'bg-red-50 text-red-700',
  race: 'bg-purple-50 text-purple-700',
  long: 'bg-teal-50 text-teal-700',
  strength: 'bg-emerald-50 text-emerald-700',
  yoga: 'bg-pink-50 text-pink-700',
  'cross-training': 'bg-indigo-50 text-indigo-700',
}

const WORKOUT_TYPE_KEYS = [
  'easy', 'tempo', 'threshold', 'vo2max', 'endurance',
  'long', 'strength', 'yoga', 'cross-training',
] as const

interface Props {
  workout: PlannedWorkout
  compact?: boolean
}

export function WorkoutCard({ workout, compact = false }: Props) {
  const t = useTranslations('app')
  const colorClass = TYPE_COLORS[workout.workout_type] ?? 'bg-muted text-muted-foreground'

  const typeKey = WORKOUT_TYPE_KEYS.find((k) => k === workout.workout_type)
  const typeLabel = typeKey
    ? t(`plan.generate.workoutTypes.${typeKey}` as never)
    : workout.workout_type

  if (compact) {
    return (
      <div className={cn('rounded px-2 py-1 text-xs font-medium truncate', colorClass)}>
        {typeLabel}
        {workout.target_tss != null && ` · ${workout.target_tss} TSS`}
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg px-3 py-2 text-sm', colorClass)}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{typeLabel}</span>
        <div className="flex items-center gap-1">
          {workout.duration_min != null && (
            <span className="text-xs opacity-75">{workout.duration_min} min</span>
          )}
          {workout.target_tss != null && (
            <Badge variant="outline" className="text-xs h-5">
              {workout.target_tss} TSS
            </Badge>
          )}
          {workout.completed_activity_id != null && (
            <Badge variant="secondary" className="text-xs h-5">{t('plan.done')}</Badge>
          )}
        </div>
      </div>
      {workout.description && (
        <p className="text-xs mt-1 opacity-80">{workout.description}</p>
      )}
    </div>
  )
}
