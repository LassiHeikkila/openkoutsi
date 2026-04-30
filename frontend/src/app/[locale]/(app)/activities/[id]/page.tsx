'use client'

import { use, useRef, useState } from 'react'
import useSWR from 'swr'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from '@/navigation'
import { fetcher, apiFetch, apiDownload } from '@/lib/api'
import type { ActivityDetail, AthleteProfile } from '@/lib/types'
import { getLlmConfig, streamAnalysis } from '@/lib/llm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StreamChart } from '@/components/charts/StreamChart'
import { SpeedElevationChart } from '@/components/charts/SpeedElevationChart'
import { ZoneBar, toZoneEntries } from '@/components/charts/ZoneBar'
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
import { IntervalsTable } from '@/components/activities/IntervalsTable'
import { SourceBadge } from '@/components/activities/SourceBadge'
import { WorkoutCategoryBadge } from '@/components/activities/WorkoutCategoryBadge'
import { formatDate, formatDuration, formatDistance, formatPower, formatHR, formatDistanceLabel, formatTime, formatSpeedKmh } from '@/lib/utils'
import { formatDuration as formatPeriod } from '@/components/charts/PowerCurveChart'
import { ArrowLeft, Download, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

interface Props {
  params: Promise<{ id: string }>
}

export default function ActivityDetailPage({ params }: Props) {
  const t = useTranslations('activities')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const { id } = use(params)
  const router = useRouter()
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)
  const { data: activity, isLoading, mutate } = useSWR<ActivityDetail>(
    `/api/activities/${id}`,
    fetcher,
    { refreshInterval: (data) => data?.analysis_status === 'pending' ? 2000 : 0 },
  )
  const { data: zonesData } = useSWR<{ hr?: Record<string, number>; power?: Record<string, number> }>(
    `/api/metrics/zones/${id}`,
    fetcher,
    { shouldRetryOnError: false },
  )
  const { data: athlete } = useSWR<AthleteProfile>('/api/athlete/', fetcher)

  const [reprocessing, setReprocessing] = useState(false)

  async function handleReprocessIntervals() {
    setReprocessing(true)
    try {
      const updated = await apiFetch(`/api/activities/${id}/reprocess-intervals`, { method: 'POST' }) as ActivityDetail
      await apiFetch(`/api/activities/${id}/recalculate-category`, { method: 'POST' })
      await mutate(updated, false)
      await mutate()
    } catch {
      toast({ title: t('detail.reprocessFailed'), variant: 'destructive' })
    } finally {
      setReprocessing(false)
    }
  }

  async function handleCategoryChange(category: string | null) {
    try {
      await apiFetch(`/api/activities/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ workout_category: category }),
      })
      await mutate()
    } catch {
      // silently ignore; the select will revert on next render
    }
  }

  // Frontend LLM streaming state
  const [streamingText, setStreamingText] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const llmConfig = getLlmConfig(athlete?.app_settings)

  function startEditingTitle() {
    setTitleDraft(activity?.name ?? '')
    setEditingTitle(true)
    setTimeout(() => titleInputRef.current?.select(), 0)
  }

  async function commitTitle() {
    const name = titleDraft.trim()
    if (!name || name === activity?.name) {
      setEditingTitle(false)
      return
    }
    try {
      await apiFetch(`/api/activities/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      })
      await mutate()
    } catch (err) {
      toast({
        title: t('detail.renameFailed'),
        description: err instanceof Error ? err.message : tCommon('unknownError'),
        variant: 'destructive',
      })
    } finally {
      setEditingTitle(false)
    }
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitTitle()
    if (e.key === 'Escape') setEditingTitle(false)
  }

  async function handleDownloadFit() {
    try {
      const name = activity?.name ?? id
      await apiDownload(`/api/activities/${id}/fit`, `${name}.fit`)
    } catch (err) {
      toast({
        title: t('detail.downloadFailed'),
        description: err instanceof Error ? err.message : tCommon('unknownError'),
        variant: 'destructive',
      })
    }
  }

  async function handleDelete() {
    try {
      await apiFetch(`/api/activities/${id}`, { method: 'DELETE' })
      toast({ title: t('detail.deleted') })
      router.replace('/activities')
    } catch (err) {
      toast({
        title: t('detail.deleteFailed'),
        description: err instanceof Error ? err.message : tCommon('unknownError'),
        variant: 'destructive',
      })
    }
  }

  async function handleAnalyze() {
    if (llmConfig && activity && athlete) {
      // User-configured LLM path: proxied through the backend (/api/llm/chat).
      // The API key is decrypted server-side — it never touches the browser.
      abortRef.current = new AbortController()
      setStreamingText('')
      try {
        const full = await streamAnalysis(
          activity,
          athlete,
          (chunk) => setStreamingText((t) => (t ?? '') + chunk),
          abortRef.current.signal,
          locale,
        )
        // Persist result to backend
        await apiFetch(`/api/activities/${id}/analysis`, {
          method: 'PATCH',
          body: JSON.stringify({ analysis: full }),
        })
        setStreamingText(null)
        mutate()
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setStreamingText(null)
          return
        }
        setStreamingText(null)
        toast({
          title: t('detail.analysis.analysisFailed'),
          description: err instanceof Error ? err.message : tCommon('unknownError'),
          variant: 'destructive',
        })
      }
    } else {
      // Server-side LLM path (server has its own LLM configured)
      try {
        await apiFetch(`/api/activities/${id}/analyze`, { method: 'POST' })
        mutate()
      } catch (err) {
        toast({
          title: t('detail.analysis.analysisFailedToStart'),
          description: err instanceof Error ? err.message : tCommon('unknownError'),
          variant: 'destructive',
        })
      }
    }
  }

  if (isLoading) {
    return <p className="text-muted-foreground">{t('detail.loading')}</p>
  }

  if (!activity) {
    return <p className="text-muted-foreground">{t('detail.notFound')}</p>
  }

  const isStreaming = streamingText !== null
  const isAnalysisPending = activity.analysis_status === 'pending' && !isStreaming

  const stats = [
    { label: t('detail.stats.date'), value: formatDate(activity.start_time) },
    { label: t('detail.stats.duration'), value: formatDuration(activity.duration_s) },
    { label: t('detail.stats.distance'), value: activity.distance_m != null ? formatDistance(activity.distance_m) : '—' },
    { label: t('detail.stats.avgPower'), value: formatPower(activity.avg_power) },
    { label: t('detail.stats.np'), value: formatPower(activity.normalized_power) },
    { label: t('detail.stats.if'), value: activity.intensity_factor != null ? activity.intensity_factor.toFixed(2) : '—' },
    { label: t('detail.stats.tss'), value: activity.tss != null ? Math.round(activity.tss).toString() : '—' },
    { label: t('detail.stats.avgHr'), value: formatHR(activity.avg_hr) },
    { label: t('detail.stats.maxHr'), value: formatHR(activity.max_hr) },
    { label: t('detail.stats.elevation'), value: activity.elevation_m != null ? `${Math.round(activity.elevation_m)} m` : '—' },
  ]

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            {editingTitle ? (
              <Input
                ref={titleInputRef}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={handleTitleKeyDown}
                className="h-8 text-xl font-bold px-1 w-48 sm:w-72"
                autoFocus
              />
            ) : (
              <h1
                className="text-xl font-bold cursor-pointer hover:text-muted-foreground transition-colors"
                onClick={startEditingTitle}
                title={t('detail.clickToRename')}
              >
                {activity.name}
              </h1>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-muted-foreground capitalize">{activity.sport_type}</p>
              <WorkoutCategoryBadge
                category={activity.workout_category}
                editable
                onCategoryChange={handleCategoryChange}
              />
              <SourceBadge sources={activity.sources} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activity.status === 'processed' && (
            <Button
              variant="outline"
              size="icon"
              onClick={handleReprocessIntervals}
              disabled={reprocessing}
              title={t('detail.reprocessIntervals')}
            >
              <RefreshCw className={`h-4 w-4 ${reprocessing ? 'animate-spin' : ''}`} />
            </Button>
          )}
          {activity.has_fit_file && (
            <Button variant="outline" size="icon" onClick={handleDownloadFit} title={t('detail.downloadFit')}>
              <Download className="h-4 w-4" />
            </Button>
          )}
          <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="icon" className="text-destructive border-destructive/30 hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('detail.deleteTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('detail.deleteDesc')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleDelete}
              >
                {tCommon('delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {stats.map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="font-semibold mt-0.5">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Intervals */}
      {activity.intervals?.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <IntervalsTable intervals={activity.intervals} />
          </CardContent>
        </Card>
      )}

      {/* Zone breakdown — HR and power side by side */}
      {(zonesData?.hr || zonesData?.power) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('detail.zones.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {zonesData.hr && (
                <ZoneBar title={t('detail.zones.heartRate')} data={toZoneEntries(zonesData.hr)} />
              )}
              {zonesData.power && (
                <ZoneBar title={t('detail.zones.power')} data={toZoneEntries(zonesData.power)} />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Power/HR stream */}
      {(activity.streams?.power || activity.streams?.heartrate) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('detail.powerHr')}</CardTitle>
          </CardHeader>
          <CardContent>
            <StreamChart streams={activity.streams} intervals={activity.intervals} />
          </CardContent>
        </Card>
      )}

      {/* Speed & elevation stream */}
      {(activity.streams?.speed || activity.streams?.altitude) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('detail.speedElevation')}</CardTitle>
          </CardHeader>
          <CardContent>
            <SpeedElevationChart streams={activity.streams} intervals={activity.intervals} />
          </CardContent>
        </Card>
      )}

      {/* Power bests */}
      {Object.keys(activity.power_bests ?? {}).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('detail.powerBests')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {Object.entries(activity.power_bests)
                .map(([d, w]) => [Number(d), w] as [number, number])
                .sort((a, b) => a[0] - b[0])
                .map(([duration_s, power_w]) => (
                  <div
                    key={duration_s}
                    className="flex flex-col items-center py-3 px-2 border-b border-r last:border-r-0 hover:bg-muted/30 transition-colors"
                  >
                    <span className="text-xs text-muted-foreground font-mono">
                      {formatPeriod(duration_s)}
                    </span>
                    <span className="font-semibold text-sm mt-0.5 tabular-nums">
                      {Math.round(power_w)} W
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Distance bests */}
      {Object.keys(activity.distance_bests ?? {}).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('detail.distanceBests')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {Object.entries(activity.distance_bests)
                .map(([d, t]) => [Number(d), t] as [number, number])
                .sort((a, b) => a[0] - b[0])
                .map(([distance_m, time_s]) => (
                  <div
                    key={distance_m}
                    className="flex flex-col items-center py-3 px-2 border-b border-r last:border-r-0 hover:bg-muted/30 transition-colors"
                  >
                    <span className="text-xs text-muted-foreground font-mono">
                      {formatDistanceLabel(distance_m)}
                    </span>
                    <span className="font-semibold text-sm mt-0.5 tabular-nums">
                      {formatTime(time_s)}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      ({formatSpeedKmh(distance_m, time_s)})
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Analysis */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">{t('detail.analysis.title')}</CardTitle>
          {!isStreaming && !activity.analysis_status && (
            <Button size="sm" variant="outline" onClick={handleAnalyze}>
              {t('detail.analysis.analyse')}
            </Button>
          )}
          {!isStreaming && activity.analysis_status === 'error' && (
            <Button size="sm" variant="outline" onClick={handleAnalyze}>
              {t('detail.analysis.retry')}
            </Button>
          )}
          {!isStreaming && activity.analysis_status === 'done' && (
            <Button size="sm" variant="outline" onClick={handleAnalyze}>
              {t('detail.analysis.reanalyse')}
            </Button>
          )}
          {isStreaming && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => abortRef.current?.abort()}
            >
              {t('detail.analysis.stop')}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isStreaming && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span>{t('detail.analysis.analysing')}</span>
              </div>
              {streamingText && (
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{streamingText}</p>
              )}
            </div>
          )}
          {!isStreaming && isAnalysisPending && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span>{t('detail.analysis.analysingWait')}</span>
            </div>
          )}
          {!isStreaming && activity.analysis && (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{activity.analysis}</p>
          )}
          {!isStreaming && activity.analysis_status === 'error' && !activity.analysis && (
            <p className="text-sm text-destructive">{t('detail.analysis.failed')}</p>
          )}
          {!isStreaming && !activity.analysis_status && (
            <p className="text-sm text-muted-foreground">
              {t('detail.analysis.noAnalysis')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
