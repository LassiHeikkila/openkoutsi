'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { apiFetch } from '@/lib/api'

interface Props {
  planId: string
  /** Called after workouts are generated, e.g. to refresh the workouts list. */
  onGenerated?: () => void
}

interface GenerateResultItem {
  planned_workout_id: string
  date: string
  workout_type?: string | null
  workout_definition_id?: string | null
  status: 'generated' | 'skipped' | 'failed'
  reason?: string | null
}

/**
 * "Generate workouts" action: synthesizes structured workouts for the plan's
 * upcoming (today→+6) days and caches them on the planned workouts. The
 * generated workouts appear in the Workouts tab, where they can be uploaded to
 * Wahoo individually. Generation is independent of any device connection.
 */
export function GenerateWorkoutsDialog({ planId, onGenerated }: Props) {
  const t = useTranslations('app')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<GenerateResultItem[] | null>(null)

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    setResults(null)
    try {
      const data = await apiFetch<{ results: GenerateResultItem[] }>(
        `/api/plans/${planId}/generate-upcoming/workouts`,
        { method: 'POST', body: JSON.stringify({}) },
      )
      setResults(data.results)
      if (data.results.some((r) => r.status === 'generated')) {
        onGenerated?.()
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('plan.generateWorkoutsError')
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) {
      setResults(null)
      setError(null)
    }
  }

  const statusLabel: Record<GenerateResultItem['status'], string> = {
    generated: t('plan.statusGenerated'),
    skipped: t('plan.statusSkipped'),
    failed: t('plan.statusFailed'),
  }
  const statusColor: Record<GenerateResultItem['status'], string> = {
    generated: 'text-green-600',
    skipped: 'text-muted-foreground',
    failed: 'text-destructive',
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Sparkles className="h-4 w-4" />
        <span className="ml-1 hidden sm:inline">{t('plan.generateWorkouts')}</span>
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('plan.generateWorkouts')}</DialogTitle>
          </DialogHeader>

          {results ? (
            results.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('plan.generateWorkoutsNothing')}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {results.map((r) => (
                  <li key={r.planned_workout_id} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      {r.date}
                      {r.workout_type ? ` · ${r.workout_type}` : ''}
                    </span>
                    <span className={statusColor[r.status]}>{statusLabel[r.status]}</span>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <p className="text-sm text-muted-foreground">{t('plan.generateWorkoutsDescription')}</p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button variant="ghost" onClick={() => handleOpenChange(false)}>
              {results ? t('plan.close') : t('plan.unlinkCancel')}
            </Button>
            {!results && (
              <Button disabled={loading} onClick={handleGenerate}>
                {loading ? t('plan.generating') : t('plan.generateWorkouts')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
