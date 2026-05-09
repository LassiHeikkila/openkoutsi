'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { format, isSameMonth } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from '@/navigation'
import { fetcher } from '@/lib/api'
import type { Activity, PaginatedActivities } from '@/lib/types'
import {
  getCalendarGrid,
  groupActivitiesByDate,
  monthBounds,
  offsetMonth,
} from '@/lib/calendarUtils'
import { formatDuration, formatDistance } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'


function ActivityListRow({ activity, slug }: { activity: Activity; slug: string }) {
  const parts: string[] = [formatDuration(activity.duration_s)]
  if (activity.distance_m != null) parts.push(formatDistance(activity.distance_m))
  if (activity.tss != null) parts.push(`${Math.round(activity.tss)} TSS`)

  return (
    <Link href={`/t/${slug}/activities/${activity.id}`}>
      <div className="rounded-md border px-3 py-2 hover:bg-muted transition-colors cursor-pointer">
        <p className="text-sm font-medium">{activity.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{parts.join(' · ')}</p>
      </div>
    </Link>
  )
}

export function ActivityCalendar() {
  const t = useTranslations('dashboard')
  const { slug } = useParams<{ slug: string }>()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { start, end } = monthBounds(year, month)
  const { data, isLoading } = useSWR<PaginatedActivities>(
    `/api/activities/?start=${start}&end=${end}&page_size=100`,
    fetcher,
  )

  const byDate = groupActivitiesByDate(data?.items ?? [])
  const grid = getCalendarGrid(year, month)
  const currentMonthStart = new Date(year, month, 1)

  const selectedActivities = selectedDay
    ? (byDate.get(format(selectedDay, 'yyyy-MM-dd')) ?? [])
    : []

  function handlePrev() {
    const next = offsetMonth(year, month, -1)
    setYear(next.year)
    setMonth(next.month)
  }

  function handleNext() {
    const next = offsetMonth(year, month, 1)
    setYear(next.year)
    setMonth(next.month)
  }

  function handleDayClick(day: Date) {
    const key = format(day, 'yyyy-MM-dd')
    if (!byDate.has(key)) return
    setSelectedDay(day)
    setDialogOpen(true)
  }

  const dayNames = t.raw('calendar.dayNames') as string[]
  const monthNames = t.raw('calendar.monthNames') as string[]

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{t('calendar.title')}</CardTitle>
              {isLoading && <span className="text-xs text-muted-foreground">{t('calendar.loading')}</span>}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handlePrev} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="h-7 w-[110px] text-xs px-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthNames.map((name, i) => (
                    <SelectItem key={i} value={String(i)} className="text-xs">{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="h-7 w-[70px] text-xs px-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: now.getFullYear() - 2000 + 3 }, (_, i) => 2000 + i).map((y) => (
                    <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNext} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Day-name header */}
          <div className="grid grid-cols-7 mb-1">
            {dayNames.map((d) => (
              <div key={d} className="text-xs text-center text-muted-foreground py-1 font-medium">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-1">
            {grid.map((day) => {
                const key = format(day, 'yyyy-MM-dd')
                const activities = byDate.get(key) ?? []
                const inMonth = isSameMonth(day, currentMonthStart)
                const hasActivities = activities.length > 0
                const bars = activities.slice(0, 3)
                const overflow = activities.length - 3

                return (
                  <div
                    key={key}
                    onClick={() => handleDayClick(day)}
                    className={[
                      'min-h-[56px] rounded-md p-1.5 flex flex-col transition-colors',
                      inMonth ? '' : 'opacity-35',
                      hasActivities
                        ? 'cursor-pointer bg-primary/10 border border-primary/20 hover:bg-primary/20'
                        : 'border border-transparent',
                    ].join(' ')}
                  >
                    <span className={[
                      'text-xs leading-none font-medium',
                      hasActivities && inMonth ? 'text-primary' : 'text-muted-foreground',
                    ].join(' ')}>
                      {format(day, 'd')}
                    </span>
                    {hasActivities && (
                      <div className="flex flex-col gap-0.5 mt-auto">
                        {bars.map((a) => (
                          <div
                            key={a.id}
                            className="h-1 w-full rounded-full bg-primary/70"
                            title={a.name}
                          />
                        ))}
                        {overflow > 0 && (
                          <span className="text-[9px] text-primary/70 leading-none font-medium">
                            +{overflow}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>

          {/* Empty state */}
          {!isLoading && data && data.items.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">{t('calendar.noActivities')}</p>
          )}
        </CardContent>
      </Card>

      {/* Day detail dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {selectedDay && format(selectedDay, 'MMMM d, yyyy')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-1">
            {selectedActivities.map((a) => (
              <ActivityListRow key={a.id} activity={a} slug={slug} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
