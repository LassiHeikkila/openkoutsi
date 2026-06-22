'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import useSWR from 'swr'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { apiFetch, fetcher, getTeamSlug } from '@/lib/api'

interface Props {
  planId: string
}

interface PushResultItem {
  planned_workout_id: string
  date: string
  workout_type?: string | null
  status: 'pushed' | 'skipped' | 'failed'
  reason?: string | null
}

/**
 * "Push this week to Wahoo" action: synthesizes structured workouts for the
 * plan's upcoming (today→+6) days and pushes them to Wahoo. Only rendered when
 * Wahoo is connected; reuses the insufficient_scope → reconnect messaging.
 */
export function PushWeekToWahooDialog({ planId }: Props) {
  const t = useTranslations('app')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<PushResultItem[] | null>(null)

  // Only show the action when Wahoo is connected.
  const { data: status } = useSWR<{ connected: string[] }>(
    '/api/integrations/status',
    fetcher,
  )
  const connected = status?.connected?.includes('wahoo') ?? false
  if (!connected) return null

  async function handlePush() {
    setLoading(true)
    setError(null)
    setResults(null)
    try {
      const data = await apiFetch<{ results: PushResultItem[] }>(
        `/api/plans/${planId}/push-upcoming/wahoo`,
        { method: 'POST', body: JSON.stringify({}) },
      )
      setResults(data.results)
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('plan.pushWeekError')
      setError(msg === 'insufficient_scope' ? t('plan.reconnectWahoo') : msg)
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

  const slug = getTeamSlug()
  const profileHref = slug ? `/t/${slug}/profile` : '/'

  const statusLabel: Record<PushResultItem['status'], string> = {
    pushed: t('plan.statusPushed'),
    skipped: t('plan.statusSkipped'),
    failed: t('plan.statusFailed'),
  }
  const statusColor: Record<PushResultItem['status'], string> = {
    pushed: 'text-green-600',
    skipped: 'text-muted-foreground',
    failed: 'text-destructive',
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Send className="h-4 w-4" />
        <span className="ml-1 hidden sm:inline">{t('plan.pushWeekToWahoo')}</span>
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('plan.pushWeekToWahoo')}</DialogTitle>
          </DialogHeader>

          {results ? (
            results.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('plan.pushWeekNothing')}</p>
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
            <p className="text-sm text-muted-foreground">{t('plan.pushWeekDescription')}</p>
          )}

          {error && (
            <p className="text-sm text-destructive">
              {error}{' '}
              {error === t('plan.reconnectWahoo') && (
                <a href={profileHref} className="underline">
                  {t('plan.goToProfile')}
                </a>
              )}
            </p>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => handleOpenChange(false)}>
              {results ? t('plan.close') : t('plan.unlinkCancel')}
            </Button>
            {!results && (
              <Button disabled={loading} onClick={handlePush}>
                {loading ? t('plan.pushing') : t('plan.pushWeekToWahoo')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
