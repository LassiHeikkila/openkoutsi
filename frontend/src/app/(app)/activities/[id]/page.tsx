'use client'

import { use, useRef, useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { fetcher, apiFetch, apiDownload } from '@/lib/api'
import type { ActivityDetail } from '@/lib/types'
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
import { SourceBadge } from '@/components/activities/SourceBadge'
import { formatDate, formatDuration, formatDistance, formatPower, formatHR, formatDistanceLabel, formatTime, formatSpeedKmh } from '@/lib/utils'
import { formatDuration as formatPeriod } from '@/components/charts/PowerCurveChart'
import { ArrowLeft, Download, Loader2, Trash2 } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

interface Props {
  params: Promise<{ id: string }>
}

export default function ActivityDetailPage({ params }: Props) {
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
        title: 'Rename failed',
        description: err instanceof Error ? err.message : 'Unknown error',
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
        title: 'Download failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  async function handleDelete() {
    try {
      await apiFetch(`/api/activities/${id}`, { method: 'DELETE' })
      toast({ title: 'Activity deleted' })
      router.replace('/activities')
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  async function handleAnalyze() {
    try {
      await apiFetch(`/api/activities/${id}/analyze`, { method: 'POST' })
      mutate()
    } catch (err) {
      toast({
        title: 'Analysis failed to start',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  if (isLoading) {
    return <p className="text-muted-foreground">Loading…</p>
  }

  if (!activity) {
    return <p className="text-muted-foreground">Activity not found</p>
  }

  const stats = [
    { label: 'Date', value: formatDate(activity.start_time) },
    { label: 'Duration', value: formatDuration(activity.duration_s) },
    { label: 'Distance', value: activity.distance_m != null ? formatDistance(activity.distance_m) : '—' },
    { label: 'Avg power', value: formatPower(activity.avg_power) },
    { label: 'NP', value: formatPower(activity.normalized_power) },
    { label: 'IF', value: activity.intensity_factor != null ? activity.intensity_factor.toFixed(2) : '—' },
    { label: 'TSS', value: activity.tss != null ? Math.round(activity.tss).toString() : '—' },
    { label: 'Avg HR', value: formatHR(activity.avg_hr) },
    { label: 'Max HR', value: formatHR(activity.max_hr) },
    { label: 'Elevation', value: activity.elevation_m != null ? `${Math.round(activity.elevation_m)} m` : '—' },
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
                className="h-8 text-xl font-bold px-1 w-72"
                autoFocus
              />
            ) : (
              <h1
                className="text-xl font-bold cursor-pointer hover:text-muted-foreground transition-colors"
                onClick={startEditingTitle}
                title="Click to rename"
              >
                {activity.name}
              </h1>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-muted-foreground capitalize">{activity.sport_type}</p>
              <SourceBadge source={activity.source} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activity.has_fit_file && (
            <Button variant="outline" size="icon" onClick={handleDownloadFit} title="Download FIT file">
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
              <AlertDialogTitle>Delete activity?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the activity and recalculate your fitness metrics.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleDelete}
              >
                Delete
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

      {/* Zone breakdown — HR and power side by side */}
      {(zonesData?.hr || zonesData?.power) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Zone Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {zonesData.hr && (
                <ZoneBar title="Heart Rate" data={toZoneEntries(zonesData.hr)} />
              )}
              {zonesData.power && (
                <ZoneBar title="Power" data={toZoneEntries(zonesData.power)} />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Power/HR stream */}
      {(activity.streams?.power || activity.streams?.heartrate) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Power & Heart Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <StreamChart streams={activity.streams} />
          </CardContent>
        </Card>
      )}

      {/* Speed & elevation stream */}
      {(activity.streams?.speed || activity.streams?.altitude) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Speed & Elevation</CardTitle>
          </CardHeader>
          <CardContent>
            <SpeedElevationChart streams={activity.streams} />
          </CardContent>
        </Card>
      )}

      {/* Power bests */}
      {Object.keys(activity.power_bests ?? {}).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Power Bests</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6">
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
            <CardTitle className="text-base">Distance Bests</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6">
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
          <CardTitle className="text-base">AI Analysis</CardTitle>
          {!activity.analysis_status && (
            <Button size="sm" variant="outline" onClick={handleAnalyze}>
              Analyse workout
            </Button>
          )}
          {activity.analysis_status === 'error' && (
            <Button size="sm" variant="outline" onClick={handleAnalyze}>
              Retry
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {activity.analysis_status === 'pending' && !activity.analysis && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span>Analysing… this may take a few minutes</span>
            </div>
          )}
          {activity.analysis && (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{activity.analysis}</p>
          )}
          {activity.analysis_status === 'error' && !activity.analysis && (
            <p className="text-sm text-destructive">Analysis failed. Please try again.</p>
          )}
          {!activity.analysis_status && (
            <p className="text-sm text-muted-foreground">
              No analysis yet. Click &ldquo;Analyse workout&rdquo; to generate AI coaching feedback.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
