'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useAuth } from '@/lib/auth'
import { fetcher, apiFetch } from '@/lib/api'
import type { FitnessPoint, FitnessCurrent, Activity } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FitnessChart } from '@/components/charts/FitnessChart'
import { WeeklyTssBar } from '@/components/charts/WeeklyTssBar'
import { ActivityCard } from '@/components/activities/ActivityCard'
import { toast } from '@/components/ui/use-toast'
import { RefreshCw } from 'lucide-react'

function FormBadge({ form }: { form: FitnessCurrent['form'] }) {
  const colors: Record<FitnessCurrent['form'], string> = {
    peak: 'bg-green-100 text-green-800',
    fresh: 'bg-blue-100 text-blue-800',
    neutral: 'bg-gray-100 text-gray-800',
    tired: 'bg-yellow-100 text-yellow-800',
    overreached: 'bg-red-100 text-red-800',
  }
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${colors[form]}`}>
      {form}
    </span>
  )
}

export default function DashboardPage() {
  const { athlete } = useAuth()
  const [recalculating, setRecalculating] = useState(false)
  const { data: current, mutate: mutateCurrent } = useSWR<FitnessCurrent>('/api/metrics/fitness/current', fetcher)
  const { data: history, mutate: mutateHistory } = useSWR<FitnessPoint[]>(
    '/api/metrics/fitness?days=90',
    fetcher,
  )

  async function handleRecalculate() {
    setRecalculating(true)
    try {
      await apiFetch('/api/metrics/recalculate', { method: 'POST' })
      toast({ title: 'Recalculation started', description: 'Fitness metrics will update in a moment' })
      // Poll for updated data after a short delay
      setTimeout(() => {
        mutateCurrent()
        mutateHistory()
        setRecalculating(false)
      }, 3000)
    } catch (err) {
      toast({
        title: 'Recalculation failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
      setRecalculating(false)
    }
  }
  const { data: recentActivities } = useSWR<{ items: Activity[]; total: number }>(
    '/api/activities/?page=1&page_size=5',
    fetcher,
  )

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          {athlete?.name && (
            <p className="text-muted-foreground">Welcome back, {athlete.name}</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRecalculate}
          disabled={recalculating}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${recalculating ? 'animate-spin' : ''}`} />
          {recalculating ? 'Recalculating…' : 'Recalculate fitness'}
        </Button>
      </div>

      {/* Current metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'CTL (Fitness)', value: current?.ctl.toFixed(0) ?? '—' },
          { label: 'ATL (Fatigue)', value: current?.atl.toFixed(0) ?? '—' },
          { label: 'TSB (Form)', value: current?.tsb.toFixed(0) ?? '—' },
          { label: 'FTP', value: athlete?.ftp ? `${athlete.ftp} W` : '—' },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold mt-1">{value}</p>
              {label === 'TSB (Form)' && current?.form && (
                <FormBadge form={current.form} />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Fitness history chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fitness (90 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {history && history.length > 0 ? (
            <FitnessChart data={history} />
          ) : (
            <p className="text-sm text-muted-foreground py-12 text-center">
              No data yet — upload activities to start tracking
            </p>
          )}
        </CardContent>
      </Card>

      {/* Weekly TSS */}
      {history && history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Weekly TSS (12 weeks)</CardTitle>
          </CardHeader>
          <CardContent>
            <WeeklyTssBar data={history} />
          </CardContent>
        </Card>
      )}

      {/* Recent activities */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Recent activities</h2>
        <div className="space-y-2">
          {recentActivities?.items.map((a) => (
            <ActivityCard key={a.id} activity={a} />
          ))}
          {recentActivities?.items.length === 0 && (
            <p className="text-sm text-muted-foreground">No activities yet</p>
          )}
        </div>
      </div>
    </div>
  )
}
