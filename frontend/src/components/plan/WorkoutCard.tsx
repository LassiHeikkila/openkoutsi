import type { PlannedWorkout } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const TYPE_COLORS: Record<string, string> = {
  rest: 'bg-gray-100 text-gray-600',
  easy: 'bg-blue-50 text-blue-700',
  endurance: 'bg-sky-50 text-sky-700',
  tempo: 'bg-yellow-50 text-yellow-700',
  threshold: 'bg-orange-50 text-orange-700',
  vo2max: 'bg-red-50 text-red-700',
  race: 'bg-purple-50 text-purple-700',
}

interface Props {
  workout: PlannedWorkout
  compact?: boolean
}

export function WorkoutCard({ workout, compact = false }: Props) {
  const colorClass = TYPE_COLORS[workout.workout_type] ?? 'bg-muted text-muted-foreground'

  if (compact) {
    return (
      <div className={cn('rounded px-2 py-1 text-xs font-medium truncate', colorClass)}>
        {workout.workout_type}
        {workout.target_tss != null && ` · ${workout.target_tss} TSS`}
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg px-3 py-2 text-sm', colorClass)}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium capitalize">{workout.workout_type}</span>
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
            <Badge variant="secondary" className="text-xs h-5">Done</Badge>
          )}
        </div>
      </div>
      {workout.description && (
        <p className="text-xs mt-1 opacity-80">{workout.description}</p>
      )}
    </div>
  )
}
