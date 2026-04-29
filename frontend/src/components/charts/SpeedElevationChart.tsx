'use client'

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  ReferenceLine,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts'
import { formatChartTime, niceTickStepMinutes } from '@/lib/utils'
import { Interval } from '@/lib/types'

interface Props {
  streams: Record<string, number[]>
  intervals?: Interval[]
}

function downsample<T>(arr: T[], target: number): T[] {
  if (arr.length <= target) return arr
  const step = arr.length / target
  return Array.from({ length: target }, (_, i) => arr[Math.round(i * step)])
}

export function SpeedElevationChart({ streams, intervals }: Props) {
  const speedMs = streams['speed']
  const altitude = streams['altitude']

  if (!speedMs && !altitude) return null

  const dataLength = (speedMs ?? altitude)!.length
  const time = streams['time'] ?? Array.from({ length: dataLength }, (_, i) => i)

  const MAX_POINTS = 500
  const indices = downsample(
    Array.from({ length: time.length }, (_, i) => i),
    MAX_POINTS,
  )

  const data = indices.map((i) => ({
    time: Math.round(time[i] / 60),
    ...(speedMs ? { speed: Math.round(speedMs[i] * 3.6 * 10) / 10 } : {}),
    ...(altitude ? { altitude: Math.round(altitude[i]) } : {}),
  }))

  const maxMinutes = data[data.length - 1]?.time ?? 0
  const tickStep = niceTickStepMinutes(maxMinutes)
  const ticks = Array.from(
    { length: Math.floor(maxMinutes / tickStep) + 1 },
    (_, i) => i * tickStep,
  )

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="time"
          ticks={ticks}
          tickFormatter={formatChartTime}
          tick={{ fontSize: 11 }}
          tickLine={false}
        />
        {speedMs && (
          <YAxis
            yAxisId="speed"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            label={{ value: 'km/h', angle: -90, position: 'insideLeft', fontSize: 11 }}
          />
        )}
        {altitude && (
          <YAxis
            yAxisId="altitude"
            orientation="right"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            label={{ value: 'm', angle: 90, position: 'insideRight', fontSize: 11 }}
          />
        )}
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          labelFormatter={(v) => formatChartTime(Number(v))}
          formatter={(value, name) =>
            name === 'Speed (km/h)' ? [`${value} km/h`, name] : [`${value} m`, name]
          }
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {intervals?.filter((iv) => iv.start_offset_s > 0).map((iv) => (
          <ReferenceLine
            key={iv.interval_number}
            x={Math.round(iv.start_offset_s / 60)}
            yAxisId={speedMs ? 'speed' : 'altitude'}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="3 3"
            strokeOpacity={0.4}
          />
        ))}
        {altitude && (
          <Area
            yAxisId="altitude"
            type="monotone"
            dataKey="altitude"
            name="Elevation (m)"
            stroke="hsl(var(--muted-foreground))"
            fill="hsl(var(--muted))"
            strokeWidth={1}
            dot={false}
          />
        )}
        {speedMs && (
          <Line
            yAxisId="speed"
            type="monotone"
            dataKey="speed"
            name="Speed (km/h)"
            stroke="hsl(142 71% 45%)"
            dot={false}
            strokeWidth={1.5}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
