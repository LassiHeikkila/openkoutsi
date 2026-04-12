'use client'

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'
import type { FitnessPoint } from '@/lib/types'
import { format, startOfWeek, eachWeekOfInterval, subWeeks } from 'date-fns'

interface Props {
  data: FitnessPoint[]
}

export function WeeklyTssBar({ data }: Props) {
  // Aggregate daily_tss into weekly buckets (last 12 weeks)
  const now = new Date()
  const start = subWeeks(now, 12)
  const weeks = eachWeekOfInterval({ start, end: now }, { weekStartsOn: 1 })

  const byDate = new Map(data.map((d) => [d.date, d.daily_tss]))

  const weekly = weeks.map((weekStart) => {
    let total = 0
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      const key = d.toISOString().slice(0, 10)
      total += byDate.get(key) ?? 0
    }
    return { week: format(weekStart, 'MMM d'), tss: Math.round(total) }
  })

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={weekly} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <XAxis dataKey="week" tick={{ fontSize: 11 }} tickLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Bar dataKey="tss" name="Weekly TSS" fill="hsl(var(--primary))" radius={3} />
      </BarChart>
    </ResponsiveContainer>
  )
}
