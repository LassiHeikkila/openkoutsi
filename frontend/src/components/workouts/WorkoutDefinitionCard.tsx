'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Dumbbell, Clock, Zap, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { WorkoutDefinition } from '@/lib/types'
import { formatDuration } from '@/lib/utils'
import { ExportDialog } from '@/components/workouts/ExportDialog'

interface Props {
  workout: WorkoutDefinition
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}

export function WorkoutDefinitionCard({ workout, onEdit, onDelete }: Props) {
  const t = useTranslations('workouts')
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 cursor-pointer" onClick={() => onEdit(workout.id)}>
            <Dumbbell className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{workout.name}</p>
              {workout.description && (
                <p className="text-xs text-muted-foreground truncate">{workout.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ExportDialog workoutId={workout.id} workoutName={workout.name} />
            {confirmDelete ? (
              <>
                <Button size="sm" variant="destructive" onClick={() => onDelete(workout.id)}>
                  {t('confirmDelete')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  {t('cancel')}
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
          <span>{workout.sport_type}</span>
          {workout.estimated_duration_s != null && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(workout.estimated_duration_s)}
            </span>
          )}
          {workout.estimated_tss != null && (
            <span className="flex items-center gap-1 font-medium text-primary">
              <Zap className="h-3 w-3" />
              {Math.round(workout.estimated_tss)} TSS
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
