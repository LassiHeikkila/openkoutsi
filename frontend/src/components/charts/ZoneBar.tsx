'use client'

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts'

interface ZoneEntry {
  zone: string
  minutes: number
  pct: number
}

interface Props {
  data: ZoneEntry[]
  title: string
}

// Colour progression: cool (easy) → warm (hard), up to 7 zones.
const ZONE_COLORS = [
  '#60a5fa', // Z1 recovery    — blue
  '#4ade80', // Z2 endurance   — green
  '#facc15', // Z3 tempo       — yellow
  '#fb923c', // Z4 threshold   — orange
  '#f87171', // Z5 VO2max      — red
  '#c084fc', // Z6 anaerobic   — purple
  '#e879f9', // Z7 max         — fuchsia
]

function zoneColor(index: number) {
  return ZONE_COLORS[index] ?? ZONE_COLORS[ZONE_COLORS.length - 1]
}

export function ZoneBar({ data, title }: Props) {
  if (!data.length) return null

  return (
    <div>
      <p className="text-sm font-medium mb-2 text-center">{title}</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
          <XAxis
            dataKey="zone"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => `${v}m`}
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(value: number, _: string, entry) => [
              `${value} min (${entry.payload.pct.toFixed(0)}%)`,
              entry.payload.zone,
            ]}
            labelFormatter={() => ''}
          />
          <Bar dataKey="minutes" radius={[3, 3, 0, 0]} maxBarSize={48}>
            {data.map((_, i) => (
              <Cell key={i} fill={zoneColor(i)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// Converts the raw API response { "Z1": seconds, "Z2": seconds, … } into
// ZoneEntry[] sorted by zone name.
export function toZoneEntries(raw: Record<string, number>): ZoneEntry[] {
  const total = Object.values(raw).reduce((s, v) => s + v, 0)
  if (total === 0) return []
  return Object.entries(raw)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([zone, seconds]) => ({
      zone,
      minutes: Math.round(seconds / 60),
      pct: (seconds / total) * 100,
    }))
}
