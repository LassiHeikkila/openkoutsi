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
import { RefreshCw, HelpCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

const GLOSSARY = [
  {
    term: 'CTL — Chronic Training Load',
    aka: 'Fitness',
    description:
      'A 42-day exponentially weighted average of daily Training Stress Scores (TSS). It represents your long-term fitness level — the higher the number, the more training your body has adapted to.',
  },
  {
    term: 'ATL — Acute Training Load',
    aka: 'Fatigue',
    description:
      'A 7-day exponentially weighted average of TSS. It reflects how much you have trained recently. A high ATL means you are currently fatigued from recent hard training.',
  },
  {
    term: 'TSB — Training Stress Balance',
    aka: 'Form',
    description:
      'Calculated as CTL − ATL. A positive TSB means you are rested relative to your fitness (fresh/peak). A negative TSB means fatigue outweighs fitness (tired/overreached). Aim for a slightly positive TSB before a key event.',
  },
  {
    term: 'FTP — Functional Threshold Power',
    description:
      'The highest average power (in watts) you can sustain for approximately one hour. FTP is used to define training zones and to calculate TSS for power-based workouts.',
  },
  {
    term: 'TSS — Training Stress Score',
    description:
      'A single number that quantifies the training load of one workout, taking into account both duration and intensity. A one-hour ride at exactly FTP = 100 TSS. Easy rides score lower; hard interval sessions score higher.',
  },
]

function MetricsGlossaryDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Explain fitness metrics"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Fitness metrics explained</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {GLOSSARY.map(({ term, aka, description }) => (
            <div key={term}>
              <p className="text-sm font-semibold">
                {term}
                {aka && (
                  <span className="ml-1 font-normal text-muted-foreground">· {aka}</span>
                )}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

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
      <div>
      <div className="flex items-center gap-1.5 mb-3">
        <p className="text-sm font-medium text-muted-foreground">Current fitness</p>
        <MetricsGlossaryDialog />
      </div>
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
