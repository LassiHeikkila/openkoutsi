'use client'

import { useState, useMemo, useCallback } from 'react'
import useSWR from 'swr'
import { Maximize2, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Brush,
} from 'recharts'
import { fetcher } from '@/lib/api'
import { Interval } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { CombinedStreamChart, OverlayStream } from '@/components/charts/CombinedStreamChart'
import { downsample } from '@/lib/chartUtils'
import { formatChartTime } from '@/lib/utils'

interface ActivityStreamsResponse {
  streams: Record<string, number[]>
}

interface Props {
  activityId: string
  streams: Record<string, number[]>
  intervals?: Interval[]
  overlayStreams?: OverlayStream[]
}

const OVERVIEW_POINTS = 1000

/** Slice raw streams to [startFrac, endFrac] of the total length. */
function sliceStreams(
  raw: Record<string, number[]>,
  startFrac: number,
  endFrac: number,
): Record<string, number[]> {
  const refLen = Object.values(raw).find((arr) => Array.isArray(arr) && arr.length > 0)?.length ?? 0
  if (!refLen) return raw
  const start = Math.floor(startFrac * refLen)
  const end = Math.ceil(endFrac * refLen)
  const sliced: Record<string, number[]> = {}
  for (const [key, arr] of Object.entries(raw)) {
    if (Array.isArray(arr)) sliced[key] = arr.slice(start, end)
  }
  return sliced
}

export function FullscreenStreamDialog({ activityId, streams, intervals, overlayStreams }: Props) {
  const t = useTranslations('activities')
  const [open, setOpen] = useState(false)
  // Zoom range as fractions [0, 1]
  const [brushRange, setBrushRange] = useState<[number, number]>([0, 1])
  const [zoomVersion, setZoomVersion] = useState(0)

  const { data: rawData, isLoading } = useSWR<ActivityStreamsResponse>(
    open ? `/api/activities/${activityId}/streams` : null,
    fetcher,
  )

  const rawStreams = rawData?.streams ?? null

  // 1000-point overview data for the brush strip (full range, altitude preferred)
  const overviewData = useMemo(() => {
    const src = rawStreams ?? streams
    // Pick altitude or power as the visual context series
    const contextArr = src['altitude'] ?? src['power'] ?? Object.values(src).find(Array.isArray)
    if (!contextArr || contextArr.length === 0) return []
    const timeRaw = src['time'] ?? Array.from({ length: contextArr.length }, (_, i) => i)
    const indices = downsample(
      Array.from({ length: contextArr.length }, (_, i) => i),
      OVERVIEW_POINTS,
    )
    return indices.map((i) => ({ t: timeRaw[i] / 60, v: contextArr[i] ?? 0 }))
  }, [rawStreams, streams])

  // Zoomed streams: slice raw data to the brush range, then pass to chart (which downsamples to 1000)
  const zoomedStreams = useMemo(() => {
    if (!rawStreams) return streams
    if (brushRange[0] === 0 && brushRange[1] === 1) return rawStreams
    return sliceStreams(rawStreams, brushRange[0], brushRange[1])
  }, [rawStreams, streams, brushRange])

  // Zoomed intervals: filter to those within the visible time window
  const zoomedIntervals = useMemo(() => {
    if (!intervals || !rawStreams) return intervals
    const refLen = Object.values(rawStreams).find((a) => Array.isArray(a) && a.length > 0)?.length ?? 0
    const startS = brushRange[0] * refLen
    const endS = brushRange[1] * refLen
    return intervals.filter(
      (iv) => iv.start_offset_s >= startS && iv.start_offset_s <= endS,
    )
  }, [intervals, rawStreams, brushRange])

  const handleBrushChange = useCallback(
    ({ startIndex, endIndex }: { startIndex?: number; endIndex?: number }) => {
      if (startIndex == null || endIndex == null || overviewData.length === 0) return
      const len = overviewData.length - 1
      setBrushRange([startIndex / len, endIndex / len])
    },
    [overviewData.length],
  )

  const handleZoom = useCallback(
    (startMinutes: number, endMinutes: number) => {
      const src = rawStreams ?? streams
      const refLen =
        Object.values(src).find((a) => Array.isArray(a) && a.length > 0)?.length ?? 0
      if (!refLen) return
      const timeRaw = src['time'] ?? Array.from({ length: refLen }, (_, i) => i)
      const totalDurationMin = timeRaw[timeRaw.length - 1] / 60

      // Convert chart minutes (relative to current slice) to absolute fractions
      const sliceStart = brushRange[0]
      const sliceEnd = brushRange[1]
      const sliceDurationMin = totalDurationMin * (sliceEnd - sliceStart)

      const newStart = sliceStart + (startMinutes / sliceDurationMin) * (sliceEnd - sliceStart)
      const newEnd = sliceStart + (endMinutes / sliceDurationMin) * (sliceEnd - sliceStart)

      setBrushRange([Math.max(0, newStart), Math.min(1, newEnd)])
      setZoomVersion((v) => v + 1)
    },
    [rawStreams, streams, brushRange],
  )

  const handleResetZoom = useCallback(() => {
    setBrushRange([0, 1])
    setZoomVersion((v) => v + 1)
  }, [])

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) {
      setBrushRange([0, 1])
      setZoomVersion(0)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title={t('detail.chart.fullscreen')}>
          <Maximize2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[95vw] w-full h-[90vh] flex flex-col gap-0 p-4">
        <DialogHeader className="shrink-0 pb-2">
          <DialogTitle className="text-base">{t('detail.streams')}</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-1 shrink-0">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('detail.chart.loadingFull')}
          </div>
        )}

        {/* Main chart — fills remaining space */}
        <div className="flex-1 min-h-0 relative">
          <div className="absolute inset-0">
            <CombinedStreamChart
              streams={zoomedStreams}
              intervals={zoomedIntervals}
              overlayStreams={overlayStreams}
              height="100%"
              onZoom={handleZoom}
              onResetZoom={handleResetZoom}
            />
          </div>
        </div>

        {/* Overview brush strip */}
        {overviewData.length > 0 && (
          <div className="shrink-0 h-14 mt-1">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={overviewData} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="t" hide />
                <YAxis hide domain={['auto', 'auto']} />
                <Area
                  dataKey="v"
                  stroke="hsl(var(--muted-foreground))"
                  fill="hsl(var(--muted))"
                  fillOpacity={0.5}
                  strokeWidth={0.5}
                  dot={false}
                  isAnimationActive={false}
                />
                <Brush
                  key={`${rawStreams ? 'raw' : 'preview'}-${zoomVersion}`}
                  dataKey="t"
                  height={16}
                  tickFormatter={formatChartTime}
                  stroke="hsl(var(--border))"
                  fill="hsl(var(--background))"
                  travellerWidth={6}
                  startIndex={Math.round(brushRange[0] * (overviewData.length - 1))}
                  endIndex={Math.round(brushRange[1] * (overviewData.length - 1))}
                  onChange={handleBrushChange}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
