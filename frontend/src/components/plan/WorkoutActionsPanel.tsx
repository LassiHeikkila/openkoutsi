'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Activity, PlannedWorkout } from '@/lib/types'
import { WorkoutCard } from './WorkoutCard'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch } from '@/lib/api'
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
}

/**
 * Shared panel for viewing and mutating a single planned workout: shows the
 * WorkoutCard and the mark-as-completed / skip / unlink / clear-skip flows.
 * Used by both the Plan view (PlanCalendar) and the dashboard ActivityCalendar.
 */
export function WorkoutActionsPanel({ workout, date, onWorkoutUpdated }: Props) {
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

      {/* Action buttons — only when not yet completed and not skipped */}
      {workout.completed_activity_id == null && workout.skip_reason == null && (
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
    </div>
  )
}
