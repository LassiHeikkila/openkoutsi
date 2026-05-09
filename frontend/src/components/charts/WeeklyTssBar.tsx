'use client'

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts'
import { useTranslations } from 'next-intl'
import type { FitnessPoint } from '@/lib/types'
import { format, eachWeekOfInterval, subWeeks } from 'date-fns'

interface Props {
  data: FitnessPoint[]
  weeks?: number
  plannedByWeek?: Map<string, number>
}

export function WeeklyTssBar({ data, weeks = 12, plannedByWeek }: Props) {
  const t = useTranslations('dashboard')

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
    const wKey = weekStart.toISOString().slice(0, 10)
    return {
      week: format(weekStart, 'MMM d'),
      tss: Math.round(total),
      ...(plannedByWeek ? { planned: plannedByWeek.get(wKey) ?? 0 } : {}),
    }
  })

  // Show fewer x-axis labels when there are many bars
  const tickInterval = weeks <= 13 ? 0 : weeks <= 26 ? 1 : 3

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={weekly} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <XAxis
          dataKey="week"
          tickLine={false}
          interval={tickInterval}
          height={48}
          tick={({ x, y, payload }) => (
            <g transform={`translate(${x},${y})`}>
              <text
                x={0}
                y={0}
                dy={2}
                textAnchor="end"
                fill="currentColor"
                fontSize={10}
                transform="rotate(-40)"
                opacity={0.6}
              >
                {payload.value}
              </text>
            </g>
          )}
        />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        {plannedByWeek && <Legend wrapperStyle={{ fontSize: 11 }} />}
        <Bar dataKey="tss" name={t('weeklyTssActual')} fill="hsl(var(--primary))" radius={3} />
        {plannedByWeek && (
          <Bar dataKey="planned" name={t('weeklyTssPlanned')} fill="hsl(var(--muted-foreground))" radius={3} opacity={0.5} />
        )}
      </BarChart>
    </ResponsiveContainer>
  )
}
