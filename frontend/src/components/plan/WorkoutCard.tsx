'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { PlannedWorkout } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { cn } from '@/lib/utils'

const TYPE_COLORS: Record<string, string> = {
  rest: 'bg-gray-100 text-gray-600',
  recovery: 'bg-blue-50 text-blue-700',
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
  'recovery', 'tempo', 'threshold', 'vo2max', 'endurance',
  'long', 'strength', 'yoga', 'cross-training',
] as const

const SKIP_REASON_KEYS = [
  'illness', 'injury', 'fatigue', 'busy', 'lazy', 'travel', 'weather', 'other',
] as const

interface Props {
  workout: PlannedWorkout
  compact?: boolean
  onUnlink?: (workout: PlannedWorkout) => Promise<void>
  onClearSkip?: (workout: PlannedWorkout) => Promise<void>
}

export function WorkoutCard({ workout, compact = false, onUnlink, onClearSkip }: Props) {
  const t = useTranslations('app')
  const [unlinking, setUnlinking] = useState(false)
  const [clearing, setClearing] = useState(false)
  const colorClass = TYPE_COLORS[workout.workout_type] ?? 'bg-muted text-muted-foreground'

  const typeKey = WORKOUT_TYPE_KEYS.find((k) => k === workout.workout_type)
  const typeLabel = typeKey
    ? t(`plan.generate.workoutTypes.${typeKey}` as never)
    : workout.workout_type

  const handleUnlink = async () => {
    if (!onUnlink) return
    setUnlinking(true)
    try {
      await onUnlink(workout)
    } finally {
      setUnlinking(false)
    }
  }

  const handleClearSkip = async () => {
    if (!onClearSkip) return
    setClearing(true)
    try {
      await onClearSkip(workout)
    } finally {
      setClearing(false)
    }
  }

  if (compact) {
    return (
      <div className={cn('rounded px-2 py-1 text-xs font-medium truncate', colorClass)}>
        {typeLabel}
        {workout.skip_reason != null
          ? ` · ${t('plan.skipped')}`
          : workout.target_tss != null
            ? ` · ${workout.target_tss} TSS`
            : null}
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
          {workout.skip_reason != null && workout.completed_activity_id == null && (
            <Badge className="text-xs h-5 bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
              {t('plan.skipped')}
            </Badge>
          )}
        </div>
      </div>
      {workout.description && (
        <p className="text-xs mt-1 opacity-80">{workout.description}</p>
      )}
      {workout.completed_activity_id != null && onUnlink && (
        <div className="mt-2 flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-xs h-6 px-2 opacity-70 hover:opacity-100">
                {t('plan.unlink')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('plan.unlinkTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t('plan.unlinkDesc')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('plan.unlinkCancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={handleUnlink} disabled={unlinking}>
                  {t('plan.unlinkConfirm')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
      {workout.skip_reason != null && workout.completed_activity_id == null && (
        <p className="text-xs mt-1 opacity-70 italic">
          {SKIP_REASON_KEYS.includes(workout.skip_reason as typeof SKIP_REASON_KEYS[number])
            ? t(`plan.skipReasons.${workout.skip_reason}` as never)
            : workout.skip_reason}
        </p>
      )}
      {workout.skip_reason != null && workout.completed_activity_id == null && onClearSkip && (
        <div className="mt-2 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-6 px-2 opacity-70 hover:opacity-100"
            disabled={clearing}
            onClick={handleClearSkip}
          >
            {t('plan.clearSkip')}
          </Button>
        </div>
      )}
    </div>
  )
}
