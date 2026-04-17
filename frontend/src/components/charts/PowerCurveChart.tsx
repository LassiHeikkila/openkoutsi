'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import type { PowerBestEntry } from '@/lib/types'

// All 24 standard durations in seconds
const DURATIONS = [
  1, 3, 5, 10, 15, 30, 45, 60, 120, 180, 300, 480,
  900, 1200, 1800, 2700, 3600, 7200, 10800, 14400,
  18000, 21600, 25200, 28800,
]

export function formatDuration(s: number): string {
  if (s < 60) return `${s}s`
  if (s < 3600) {
    const m = s / 60
    return Number.isInteger(m) ? `${m}m` : `${Math.round(m)}m`
  }
  const h = s / 3600
  return Number.isInteger(h) ? `${h}h` : `${(h).toFixed(1)}h`
}

// Squared-log scale: position ∝ (ln x)²
// This compresses the short-effort end more aggressively than plain log.
// Approximate axis proportions vs plain log:
//   1s–30s  : 11% of width  (vs 33% with log)
//   1s–5m   : 31% of width  (vs 55% with log)
//   1s–1h   : 64% of width  (vs 80% with log)
function scaledX(s: number): number {
  const v = Math.log(Math.max(s, 1))
  return v * v
}

// Tick positions and their labels for the x-axis
const X_TICK_DURATIONS = [1, 15, 60, 300, 900, 3600, 7200, 21600, 28800]
const X_TICKS = X_TICK_DURATIONS.map(scaledX)
// Reverse-lookup: pre-built map from scaled value string → label
const TICK_LABELS = new Map(
  X_TICK_DURATIONS.map((d) => [scaledX(d).toFixed(6), formatDuration(d)])
)

interface Props {
  bests: PowerBestEntry[]
}

interface ChartPoint {
  x: number        // scaledX(duration_s) — what Recharts plots
  duration_s: number
  power_w: number
  activity_id: string
  activity_name: string | null
}

export function PowerCurveChart({ bests }: Props) {
  // Only rank-1 bests, one per duration
  const rank1 = new Map<number, PowerBestEntry>()
  for (const b of bests) {
    if (b.rank === 1) rank1.set(b.duration_s, b)
  }

  const data: ChartPoint[] = DURATIONS
    .filter((d) => rank1.has(d))
    .map((d) => {
      const b = rank1.get(d)!
      return {
        x: scaledX(d),
        duration_s: d,
        power_w: b.power_w,
        activity_id: b.activity_id,
        activity_name: b.activity_name,
      }
    })

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No power data yet. Upload a workout with power to see your curve.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="x"
          type="number"
          scale="linear"
          domain={[scaledX(1), scaledX(28800)]}
          ticks={X_TICKS}
          tickFormatter={(val: number) => TICK_LABELS.get(val.toFixed(6)) ?? ''}
          tick={{ fontSize: 11 }}
          tickLine={false}
          label={{ value: 'Duration', position: 'insideBottom', offset: -12, fontSize: 12 }}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          tickLine={false}
          width={48}
          label={{ value: 'Watts', angle: -90, position: 'insideLeft', offset: 12, fontSize: 12 }}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const p = payload[0].payload as ChartPoint
            return (
              <div className="rounded-md border bg-card px-3 py-2 text-sm shadow">
                <p className="font-semibold">{formatDuration(p.duration_s)}</p>
                <p>{Math.round(p.power_w)} W</p>
                {p.activity_name && (
                  <p className="text-muted-foreground text-xs truncate max-w-48">
                    {p.activity_name}
                  </p>
                )}
              </div>
            )
          }}
        />
        <Line
          type="monotone"
          dataKey="power_w"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={{ r: 3, fill: 'hsl(var(--primary))' }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
