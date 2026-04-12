'use client'

import { use } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { fetcher, apiFetch } from '@/lib/api'
import type { ActivityDetail } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StreamChart } from '@/components/charts/StreamChart'
import { ZoneDonut } from '@/components/charts/ZoneDonut'
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
import { formatDate, formatDuration, formatDistance, formatPower, formatHR } from '@/lib/utils'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

interface Props {
  params: Promise<{ id: string }>
}

export default function ActivityDetailPage({ params }: Props) {
  const { id } = use(params)
  const router = useRouter()
  const { data: activity, isLoading } = useSWR<ActivityDetail>(
    `/api/activities/${id}`,
    fetcher,
  )

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
            <h1 className="text-xl font-bold">{activity.name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-muted-foreground capitalize">{activity.sport_type}</p>
              <SourceBadge source={activity.source} />
            </div>
          </div>
        </div>
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

      {/* Zone breakdown */}
      {activity.zone_breakdown && activity.zone_breakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Zone Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ZoneDonut data={activity.zone_breakdown} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
