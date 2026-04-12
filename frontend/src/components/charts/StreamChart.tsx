'use client'

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts'

interface Props {
  streams: Record<string, number[]>
}

function downsample<T>(arr: T[], target: number): T[] {
  if (arr.length <= target) return arr
  const step = arr.length / target
  return Array.from({ length: target }, (_, i) => arr[Math.round(i * step)])
}

export function StreamChart({ streams }: Props) {
  const time = streams['time'] ?? []
  const power = streams['power']
  const hr = streams['heart_rate'] ?? streams['hr']

  if (!time.length) return <p className="text-sm text-muted-foreground">No stream data</p>

  const MAX_POINTS = 500
  const indices = downsample(
    Array.from({ length: time.length }, (_, i) => i),
    MAX_POINTS,
  )

  const data = indices.map((i) => ({
    time: Math.round(time[i] / 60), // minutes
    ...(power ? { power: power[i] } : {}),
    ...(hr ? { hr: hr[i] } : {}),
  }))

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="time"
          tickFormatter={(v) => `${v}m`}
          tick={{ fontSize: 11 }}
          tickLine={false}
        />
        {power && (
          <YAxis
            yAxisId="power"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            label={{ value: 'W', angle: -90, position: 'insideLeft', fontSize: 11 }}
          />
        )}
        {hr && (
          <YAxis
            yAxisId="hr"
            orientation="right"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            label={{ value: 'bpm', angle: 90, position: 'insideRight', fontSize: 11 }}
          />
        )}
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          labelFormatter={(v) => `${v} min`}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {power && (
          <Line
            yAxisId="power"
            type="monotone"
            dataKey="power"
            name="Power (W)"
            stroke="hsl(var(--primary))"
            dot={false}
            strokeWidth={1.5}
          />
        )}
        {hr && (
          <Line
            yAxisId="hr"
            type="monotone"
            dataKey="hr"
            name="HR (bpm)"
            stroke="hsl(var(--destructive))"
            dot={false}
            strokeWidth={1.5}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
