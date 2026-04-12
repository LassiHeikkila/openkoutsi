'use client'

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'
import type { ZoneBreakdown } from '@/lib/types'

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']

interface Props {
  data: ZoneBreakdown[]
  title?: string
}

export function ZoneDonut({ data, title }: Props) {
  const chartData = data.map((d) => ({
    name: d.zone,
    value: Math.round(d.seconds / 60),
    pct: d.pct,
  }))

  return (
    <div>
      {title && <p className="text-sm font-medium mb-2">{title}</p>}
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((_, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string, entry) => [
              `${value} min (${entry.payload.pct.toFixed(0)}%)`,
              name,
            ]}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
