'use client'

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'
import type { FitnessPoint } from '@/lib/types'
import { formatDate } from '@/lib/utils'

interface Props {
  data: FitnessPoint[]
}

export function FitnessChart({ data }: Props) {
  const formatted = data.map((d) => ({
    ...d,
    date: formatDate(d.date),
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={formatted} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
        <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={(value: number, name: string) => [value.toFixed(1), name]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine yAxisId="left" y={0} stroke="hsl(var(--border))" />
        <Bar yAxisId="right" dataKey="daily_tss" name="TSS" fill="hsl(var(--muted))" radius={2} />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="ctl"
          name="CTL (fitness)"
          stroke="hsl(var(--primary))"
          dot={false}
          strokeWidth={2}
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="atl"
          name="ATL (fatigue)"
          stroke="hsl(var(--destructive))"
          dot={false}
          strokeWidth={2}
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="tsb"
          name="TSB (form)"
          stroke="hsl(var(--accent-foreground))"
          dot={false}
          strokeWidth={1.5}
          strokeDasharray="4 2"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
