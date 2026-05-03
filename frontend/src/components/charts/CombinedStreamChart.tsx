'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  ReferenceLine,
  ReferenceArea,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts'
import { useTranslations } from 'next-intl'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { formatChartTime, niceTickStepMinutes } from '@/lib/utils'
import { downsample } from '@/lib/chartUtils'
import { Interval } from '@/lib/types'

type StreamKey = 'power' | 'heartrate' | 'speed' | 'altitude' | 'cadence'

const STREAM_KEYS: StreamKey[] = ['power', 'heartrate', 'speed', 'altitude', 'cadence']
const DEFAULT_VISIBLE = new Set<StreamKey>(['power', 'speed', 'altitude', 'heartrate'])
const MAX_POINTS = 1000

interface StreamConfig {
  unit: string
  color: string
  renderType: 'line' | 'area'
  yAxisId: string
  domain: [number | string, number | string]
  transform?: (v: number) => number
}

const STREAM_CONFIG: Record<StreamKey, StreamConfig> = {
  power: {
    unit: 'W',
    color: 'hsl(var(--primary))',
    renderType: 'line',
    yAxisId: 'power',
    domain: [0, 'auto'],
  },
  heartrate: {
    unit: 'bpm',
    color: 'hsl(var(--destructive))',
    renderType: 'line',
    yAxisId: 'hr',
    domain: ['auto', 'auto'],
  },
  speed: {
    unit: 'km/h',
    color: '#22c55e',
    renderType: 'line',
    yAxisId: 'speed',
    domain: [0, 'auto'],
    transform: (v) => Math.round(v * 3.6 * 10) / 10,
  },
  altitude: {
    unit: 'm',
    color: '#a78bfa',
    renderType: 'area',
    yAxisId: 'altitude',
    domain: ['auto', 'auto'],
  },
  cadence: {
    unit: 'rpm',
    color: '#f59e0b',
    renderType: 'line',
    yAxisId: 'cadence',
    domain: [0, 'auto'],
  },
}

const LEFT_PRIORITY: StreamKey[] = ['power', 'speed', 'heartrate', 'cadence', 'altitude']
const RIGHT_PRIORITY: StreamKey[] = ['altitude', 'heartrate', 'speed', 'cadence', 'power']

function getAxisAssignments(
  visible: Set<StreamKey>,
  present: Set<StreamKey>,
): { leftKey: StreamKey | null; rightKey: StreamKey | null } {
  const active = (k: StreamKey) => visible.has(k) && present.has(k)
  const leftKey = LEFT_PRIORITY.find(active) ?? null
  const rightKey = RIGHT_PRIORITY.find((k) => active(k) && k !== leftKey) ?? null
  return { leftKey, rightKey }
}

export interface OverlayStream {
  key: string
  label: string
  data: number[]
  color: string
  yAxisId: StreamKey
}

interface Props {
  streams: Record<string, number[]>
  intervals?: Interval[]
  overlayStreams?: OverlayStream[]
  height?: number | '100%'
  onZoom?: (startMinutes: number, endMinutes: number) => void
  onResetZoom?: () => void
}

export function CombinedStreamChart({
  streams,
  intervals,
  overlayStreams = [],
  height = 240,
  onZoom,
  onResetZoom,
}: Props) {
  const t = useTranslations('activities')
  const [visibleStreams, setVisibleStreams] = useState<Set<StreamKey>>(DEFAULT_VISIBLE)
  const [selectionStart, setSelectionStart] = useState<number | null>(null)
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null)
  const isDragging = useRef(false)

  const streamLabels: Record<StreamKey, string> = {
    power: t('detail.chart.streamLabels.power'),
    heartrate: t('detail.chart.streamLabels.heartrate'),
    speed: t('detail.chart.streamLabels.speed'),
    altitude: t('detail.chart.streamLabels.altitude'),
    cadence: t('detail.chart.streamLabels.cadence'),
  }

  // All heavy data computation is memoised — only re-runs when streams or overlays change
  const { presentKeys, chartData, maxMinutes, ticks } = useMemo(() => {
    const present = new Set<StreamKey>(
      STREAM_KEYS.filter((k) => Array.isArray(streams[k]) && (streams[k]?.length ?? 0) > 0),
    )

    const rawLength =
      STREAM_KEYS.map((k) => streams[k]?.length ?? 0).find((l) => l > 0) ?? 0
    if (rawLength === 0) {
      return { presentKeys: present, chartData: [], maxMinutes: 0, ticks: [] }
    }

    const timeRaw = streams['time'] ?? Array.from({ length: rawLength }, (_, i) => i)

    // Downsample index array; overlay data is addressed by raw index so this works for both
    const indices = downsample(
      Array.from({ length: timeRaw.length }, (_, i) => i),
      MAX_POINTS,
    )

    const data = indices.map((i) => {
      const point: Record<string, number> = { time: timeRaw[i] / 60 }
      for (const k of STREAM_KEYS) {
        const raw = streams[k]
        if (raw?.[i] !== undefined) {
          const cfg = STREAM_CONFIG[k]
          point[k] = cfg.transform ? cfg.transform(raw[i]) : raw[i]
        }
      }
      for (const ov of overlayStreams) {
        const v = ov.data[i]
        if (v !== undefined && !isNaN(v)) point[ov.key] = v
      }
      return point
    })

    const maxMin = Math.ceil(data[data.length - 1]?.time ?? 0)
    const step = niceTickStepMinutes(maxMin)
    const tks = Array.from({ length: Math.floor(maxMin / step) + 1 }, (_, i) => i * step)

    return { presentKeys: present, chartData: data, maxMinutes: maxMin, ticks: tks }
  }, [streams, overlayStreams])

  const { leftKey, rightKey } = useMemo(
    () => getAxisAssignments(visibleStreams, presentKeys),
    [visibleStreams, presentKeys],
  )

  function toggleStream(key: StreamKey) {
    setVisibleStreams((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const refLineAxisId =
    (leftKey && STREAM_CONFIG[leftKey].yAxisId) ||
    (rightKey && STREAM_CONFIG[rightKey].yAxisId) ||
    'power'

  const handleMouseDown = useCallback(
    (e: { activeLabel?: string | number }) => {
      if (!onZoom || e.activeLabel == null) return
      isDragging.current = true
      const val = Number(e.activeLabel)
      setSelectionStart(val)
      setSelectionEnd(val)
    },
    [onZoom],
  )

  const handleMouseMove = useCallback(
    (e: { activeLabel?: string | number }) => {
      if (!isDragging.current || e.activeLabel == null) return
      setSelectionEnd(Number(e.activeLabel))
    },
    [],
  )

  const handleMouseUp = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false
    if (selectionStart != null && selectionEnd != null) {
      const lo = Math.min(selectionStart, selectionEnd)
      const hi = Math.max(selectionStart, selectionEnd)
      if (hi - lo > 0.05) {
        onZoom?.(lo, hi)
      }
    }
    setSelectionStart(null)
    setSelectionEnd(null)
  }, [selectionStart, selectionEnd, onZoom])

  const handleMouseLeave = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false
    setSelectionStart(null)
    setSelectionEnd(null)
  }, [])

  if (chartData.length === 0) {
    return <p className="text-sm text-muted-foreground">No stream data</p>
  }

  const isFullHeight = height === '100%'

  return (
    <div className={isFullHeight ? 'flex flex-col h-full gap-3' : 'space-y-3'}>
      {/* Stream toggles */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 shrink-0">
        {STREAM_KEYS.filter((k) => presentKeys.has(k)).map((k) => {
          const cfg = STREAM_CONFIG[k]
          return (
            <div key={k} className="flex items-center gap-1.5">
              <Checkbox
                id={`stream-${k}`}
                checked={visibleStreams.has(k)}
                onCheckedChange={() => toggleStream(k)}
              />
              <Label htmlFor={`stream-${k}`} className="flex items-center gap-1 cursor-pointer text-sm">
                <span
                  className="inline-block h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: cfg.color }}
                />
                {streamLabels[k]}
              </Label>
            </div>
          )
        })}
      </div>

      <ResponsiveContainer
        width="100%"
        height={isFullHeight ? '100%' : height}
        className={isFullHeight ? 'flex-1 min-h-0' : ''}
      >
        <ComposedChart
          data={chartData}
          margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
          style={onZoom ? { cursor: 'crosshair' } : undefined}
          onMouseDown={onZoom ? handleMouseDown : undefined}
          onMouseMove={onZoom ? handleMouseMove : undefined}
          onMouseUp={onZoom ? handleMouseUp : undefined}
          onMouseLeave={onZoom ? handleMouseLeave : undefined}
          onDoubleClick={onResetZoom}
        >
          <XAxis
            dataKey="time"
            type="number"
            domain={[0, maxMinutes]}
            ticks={ticks}
            tickFormatter={formatChartTime}
            tick={{ fontSize: 11 }}
            tickLine={false}
          />

          {STREAM_KEYS.filter((k) => presentKeys.has(k)).map((k) => {
            const cfg = STREAM_CONFIG[k]
            const isLeft = k === leftKey
            const isRight = k === rightKey
            const hide = !isLeft && !isRight
            return (
              <YAxis
                key={k}
                yAxisId={cfg.yAxisId}
                orientation={isRight ? 'right' : 'left'}
                hide={hide}
                tick={hide ? false : { fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                domain={cfg.domain}
                label={
                  hide
                    ? undefined
                    : {
                        value: cfg.unit,
                        angle: isRight ? 90 : -90,
                        position: isRight ? 'insideRight' : 'insideLeft',
                        fontSize: 11,
                      }
                }
              />
            )
          })}

          {/* Hidden axes for overlay streams whose base stream is not present */}
          {overlayStreams
            .filter((ov) => !presentKeys.has(ov.yAxisId))
            .map((ov) => (
              <YAxis
                key={`overlay-axis-${ov.key}`}
                yAxisId={`overlay-${ov.key}`}
                hide
                domain={['auto', 'auto']}
              />
            ))}

          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            labelFormatter={(v) => formatChartTime(Number(v))}
            formatter={(value, name) => {
              const streamKey = STREAM_KEYS.find((k) => streamLabels[k] === name)
              if (streamKey) return [`${value} ${STREAM_CONFIG[streamKey].unit}`, name]
              return [value, name]
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />

          {intervals
            ?.filter((iv) => iv.start_offset_s > 0)
            .map((iv) => (
              <ReferenceLine
                key={iv.interval_number}
                x={iv.start_offset_s / 60}
                yAxisId={refLineAxisId}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="3 3"
                strokeOpacity={0.4}
              />
            ))}

          {/* Elevation as background area */}
          {presentKeys.has('altitude') && visibleStreams.has('altitude') && (
            <Area
              yAxisId={STREAM_CONFIG.altitude.yAxisId}
              type="monotone"
              dataKey="altitude"
              name={streamLabels.altitude}
              stroke={STREAM_CONFIG.altitude.color}
              fill={STREAM_CONFIG.altitude.color}
              fillOpacity={0.15}
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
            />
          )}

          {(STREAM_KEYS.filter((k) => k !== 'altitude') as StreamKey[])
            .filter((k) => presentKeys.has(k) && visibleStreams.has(k))
            .map((k) => (
              <Line
                key={k}
                yAxisId={STREAM_CONFIG[k].yAxisId}
                type="monotone"
                dataKey={k}
                name={streamLabels[k]}
                stroke={STREAM_CONFIG[k].color}
                dot={false}
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            ))}

          {overlayStreams.map((ov) => (
            <Line
              key={ov.key}
              yAxisId={
                presentKeys.has(ov.yAxisId)
                  ? STREAM_CONFIG[ov.yAxisId].yAxisId
                  : `overlay-${ov.key}`
              }
              type="monotone"
              dataKey={ov.key}
              name={ov.label}
              stroke={ov.color}
              dot={false}
              strokeWidth={2}
              strokeDasharray="4 2"
              isAnimationActive={false}
            />
          ))}

          {selectionStart != null && selectionEnd != null && (
            <ReferenceArea
              yAxisId={refLineAxisId}
              x1={Math.min(selectionStart, selectionEnd)}
              x2={Math.max(selectionStart, selectionEnd)}
              strokeOpacity={0.3}
              fill="hsl(var(--primary))"
              fillOpacity={0.15}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
