'use client'

import { useTranslations } from 'next-intl'
import type { TrainingPlan } from '@/lib/types'
import { WorkoutCard } from './WorkoutCard'
import { addDays, format } from 'date-fns'

interface Props {
  plan: TrainingPlan
  currentWeek?: number
}

export function PlanCalendar({ plan, currentWeek = 1 }: Props) {
  const t = useTranslations('app')
  const dayLabels = t.raw('plan.generate.dayNames') as string[]

  // Group workouts by week
  const weeks = new Map<number, typeof plan.workouts>()
  for (const w of plan.workouts) {
    if (!weeks.has(w.week_number)) weeks.set(w.week_number, [])
    weeks.get(w.week_number)!.push(w)
  }

  const weekNums = Array.from(weeks.keys()).sort((a, b) => a - b)

  return (
    <div className="space-y-6">
      {weekNums.map((wn) => {
        const workouts = weeks.get(wn)!
        const byDay = new Map(workouts.map((w) => [w.day_of_week, w]))

        const planStart = new Date(plan.start_date)
        const weekStart = addDays(planStart, (wn - 1) * 7)

        return (
          <div key={wn}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              {t('plan.weekLabel', { week: wn, date: format(weekStart, 'MMM d') })}
              {wn === currentWeek && (
                <span className="ml-2 text-primary">{t('plan.current')}</span>
              )}
            </p>
            <div className="grid grid-cols-7 gap-1">
              {dayLabels.map((label, idx) => {
                const dayNum = idx + 1 // 1=Mon
                const workout = byDay.get(dayNum)
                const date = addDays(weekStart, idx)
                return (
                  <div key={dayNum} className="min-h-[64px]">
                    <p className="text-xs text-muted-foreground mb-1">
                      {label}
                      <span className="ml-1 opacity-60">{format(date, 'd')}</span>
                    </p>
                    {workout ? (
                      <WorkoutCard workout={workout} compact />
                    ) : (
                      <div className="rounded px-2 py-1 text-xs text-muted-foreground/40 bg-muted/30">
                        {t('plan.rest')}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
