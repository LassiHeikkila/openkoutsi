'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Activity, PlannedWorkout } from '@/lib/types'
import { WorkoutCard } from './WorkoutCard'
import { WorkoutFormFields } from './WorkoutFormFields'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
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
import { apiFetch } from '@/lib/api'
import { workoutFormToPayload, type WorkoutFormValues } from '@/lib/planUtils'
import { formatDuration } from '@/lib/utils'
import { toast } from '@/components/ui/use-toast'

interface ActivityListResponse {
  items: Activity[]
  total: number
}

const SKIP_REASON_KEYS = [
  'illness', 'injury', 'fatigue', 'busy', 'lazy', 'travel', 'weather', 'other',
] as const

interface Props {
  workout: PlannedWorkout
  /** ISO date string yyyy-MM-dd of the workout's calendar day. */
  date: string
  onWorkoutUpdated: (workout: PlannedWorkout) => void
  /** Called after the workout is deleted, so the parent can drop it from view. */
  onWorkoutDeleted?: (workout: PlannedWorkout) => void
}

/**
 * Shared panel for viewing and mutating a single planned workout: shows the
 * WorkoutCard and the mark-as-completed / skip / unlink / clear-skip flows.
 * Used by both the Plan view (PlanCalendar) and the dashboard ActivityCalendar.
 */
export function WorkoutActionsPanel({ workout, date, onWorkoutUpdated, onWorkoutDeleted }: Props) {
  const t = useTranslations('app')

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

  // Edit / delete state
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<WorkoutFormValues>({
    workout_type: '', description: '', duration_min: '', target_tss: '',
  })
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const openEdit = () => {
    setEditForm({
      workout_type: workout.workout_type,
      description: workout.description ?? '',
      duration_min: workout.duration_min != null ? String(workout.duration_min) : '',
      target_tss: workout.target_tss != null ? String(workout.target_tss) : '',
    })
    setEditing(true)
  }

  const handleSaveEdit = async () => {
    setSavingEdit(true)
    try {
      const updated = await apiFetch<PlannedWorkout>(
        `/api/plans/${workout.plan_id}/workouts/${workout.id}`,
        { method: 'PUT', body: JSON.stringify(workoutFormToPayload(editForm)) },
      )
      onWorkoutUpdated(updated)
      setEditing(false)
      toast({ title: t('plan.editWorkout.success') })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('plan.editWorkout.failed')
      toast({ title: msg, variant: 'destructive' })
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await apiFetch(`/api/plans/${workout.plan_id}/workouts/${workout.id}`, {
        method: 'DELETE',
      })
      onWorkoutDeleted?.(workout)
      toast({ title: t('plan.deleteWorkout.success') })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('plan.deleteWorkout.failed')
      toast({ title: msg, variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  const handleUnlink = async (w: PlannedWorkout) => {
    try {
      await apiFetch(`/api/plans/${w.plan_id}/workouts/${w.id}/link`, {
        method: 'DELETE',
      })
      onWorkoutUpdated({ ...w, completed_activity_id: null })
      toast({ title: t('plan.unlinkSuccess') })
    } catch {
      toast({ title: t('plan.unlinkFailed'), variant: 'destructive' })
    }
  }

  const openLinkPicker = async () => {
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
    if (!selectedActivityId) return
    setLinking(true)
    try {
      await apiFetch(`/api/plans/${workout.plan_id}/workouts/${workout.id}/link`, {
        method: 'PUT',
        body: JSON.stringify({ activity_id: selectedActivityId }),
      })
      onWorkoutUpdated({ ...workout, completed_activity_id: selectedActivityId })
      setShowLinkPicker(false)
      setSelectedActivityId('')
      toast({ title: t('plan.linkSuccess') })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('plan.linkFailed')
      toast({ title: msg, variant: 'destructive' })
    } finally {
      setLinking(false)
    }
  }

  const handleSkip = async () => {
    if (!selectedSkipKey) return
    // Persist the stable key for preset reasons so the stored value is locale-independent.
    // For "other", persist the free-text the user typed.
    const reason = selectedSkipKey === 'other'
      ? (customReason.trim() || 'other')
      : selectedSkipKey

    setSkipping(true)
    try {
      await apiFetch(`/api/plans/${workout.plan_id}/workouts/${workout.id}/skip`, {
        method: 'PUT',
        body: JSON.stringify({ reason }),
      })
      onWorkoutUpdated({ ...workout, skip_reason: reason })
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

  const handleClearSkip = async (w: PlannedWorkout) => {
    try {
      await apiFetch(`/api/plans/${w.plan_id}/workouts/${w.id}/skip`, {
        method: 'DELETE',
      })
      onWorkoutUpdated({ ...w, skip_reason: null })
      toast({ title: t('plan.clearSkipSuccess') })
    } catch {
      toast({ title: t('plan.clearSkipFailed'), variant: 'destructive' })
    }
  }

  const cancelLink = () => {
    setShowLinkPicker(false)
    setSelectedActivityId('')
  }

  const cancelSkip = () => {
    setShowSkipForm(false)
    setSelectedSkipKey('')
    setCustomReason('')
  }

  return (
    <div className="space-y-3">
      <WorkoutCard
        workout={workout}
        onUnlink={handleUnlink}
        onClearSkip={handleClearSkip}
      />

      {/* Inline edit form (completed workouts are locked from editing) */}
      {editing && (
        <div className="space-y-2">
          <WorkoutFormFields
            values={editForm}
            onChange={(patch) => setEditForm((f) => ({ ...f, ...patch }))}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 text-xs"
              disabled={savingEdit}
              onClick={handleSaveEdit}
            >
              {savingEdit ? '…' : t('plan.editWorkout.save')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setEditing(false)}
            >
              {t('plan.unlinkCancel')}
            </Button>
          </div>
        </div>
      )}

      {/* Action buttons — only when not yet completed and not skipped */}
      {!editing && workout.completed_activity_id == null && workout.skip_reason == null && (
        <div className="space-y-2">
          {!showLinkPicker && !showSkipForm ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={openLinkPicker}
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
                  onClick={cancelLink}
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
                  onClick={cancelSkip}
                >
                  {t('plan.unlinkCancel')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit / delete — available whenever the workout is not completed */}
      {!editing && workout.completed_activity_id == null && !showLinkPicker && !showSkipForm && (
        <div className="flex gap-2 border-t pt-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={openEdit}
          >
            {t('plan.editWorkout.button')}
          </Button>
          {onWorkoutDeleted && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-destructive"
                  disabled={deleting}
                >
                  {t('plan.deleteWorkout.button')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('plan.deleteWorkout.title')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('plan.deleteWorkout.desc')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('plan.unlinkCancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleDelete}
                  >
                    {t('plan.deleteWorkout.confirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}
    </div>
  )
}
