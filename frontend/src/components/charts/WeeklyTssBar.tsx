'use client'

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'
import type { FitnessPoint } from '@/lib/types'
import { format, eachWeekOfInterval, subWeeks } from 'date-fns'

interface Props {
  data: FitnessPoint[]
  weeks?: number
}

export function WeeklyTssBar({ data, weeks = 12 }: Props) {
  // Aggregate daily_tss into weekly buckets
  const now = new Date()
  const start = subWeeks(now, weeks)
  const weeks_ = eachWeekOfInterval({ start, end: now }, { weekStartsOn: 1 })

  const byDate = new Map(data.map((d) => [d.date, d.daily_tss]))

  const weekly = weeks_.map((weekStart) => {
    let total = 0
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      const key = d.toISOString().slice(0, 10)
      total += byDate.get(key) ?? 0
    }
    return { week: format(weekStart, 'MMM d'), tss: Math.round(total) }
  })

  // Show fewer x-axis labels when there are many bars
  const tickInterval = weeks <= 13 ? 0 : weeks <= 26 ? 1 : 3

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={weekly} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <XAxis dataKey="week" tick={{ fontSize: 11 }} tickLine={false} interval={tickInterval} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Bar dataKey="tss" name="Weekly TSS" fill="hsl(var(--primary))" radius={3} />
      </BarChart>
    </ResponsiveContainer>
  )
}
