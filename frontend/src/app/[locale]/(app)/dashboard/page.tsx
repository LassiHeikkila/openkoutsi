'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useTranslations } from 'next-intl'
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

const PERIOD_OPTIONS = [
  { label: '1W',  days: 7 },
  { label: '1M',  days: 30 },
  { label: '3M',  days: 90 },
  { label: '6M',  days: 180 },
  { label: '1Y',  days: 365 },
  { label: '2Y',  days: 730 },
  { label: '5Y',  days: 1825 },
] as const

const GLOSSARY_KEYS = ['ctl', 'atl', 'tsb', 'ftp', 'tss'] as const

function MetricsGlossaryDialog() {
  const t = useTranslations('dashboard')
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t('explainMetrics')}
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('glossaryTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {GLOSSARY_KEYS.map((key) => (
            <div key={key}>
              <p className="text-sm font-semibold">
                {t(`glossary.${key}.term` as never)}
                {t.has(`glossary.${key}.aka` as never) && (
                  <span className="ml-1 font-normal text-muted-foreground">
                    · {t(`glossary.${key}.aka` as never)}
                  </span>
                )}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t(`glossary.${key}.description` as never)}
              </p>
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
  const t = useTranslations('dashboard')
  const { athlete } = useAuth()
  const [recalculating, setRecalculating] = useState(false)
  const [days, setDays] = useState(90)
  const { data: current, mutate: mutateCurrent } = useSWR<FitnessCurrent>('/api/metrics/fitness/current', fetcher)
  const { data: history, mutate: mutateHistory } = useSWR<FitnessPoint[]>(
    `/api/metrics/fitness?days=${days}`,
    fetcher,
  )

  async function handleRecalculate() {
    setRecalculating(true)
    try {
      await apiFetch('/api/metrics/recalculate', { method: 'POST' })
      toast({ title: t('recalcStarted'), description: t('recalcStartedDesc') })
      // Poll for updated data after a short delay
      setTimeout(() => {
        mutateCurrent()
        mutateHistory()
        setRecalculating(false)
      }, 3000)
    } catch (err) {
      toast({
        title: t('recalcFailed'),
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
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          {athlete?.name && (
            <p className="text-muted-foreground">{t('welcomeBack', { name: athlete.name })}</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRecalculate}
          disabled={recalculating}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${recalculating ? 'animate-spin' : ''}`} />
          {recalculating ? t('recalculating') : t('recalculate')}
        </Button>
      </div>

      {/* Current metrics */}
      <div>
      <div className="flex items-center gap-1.5 mb-3">
        <p className="text-sm font-medium text-muted-foreground">{t('currentFitness')}</p>
        <MetricsGlossaryDialog />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { labelKey: 'metrics.ctl' as const, value: current?.ctl.toFixed(0) ?? '—', isForm: false },
          { labelKey: 'metrics.atl' as const, value: current?.atl.toFixed(0) ?? '—', isForm: false },
          { labelKey: 'metrics.tsb' as const, value: current?.tsb.toFixed(0) ?? '—', isForm: true },
          { labelKey: 'metrics.ftp' as const, value: athlete?.ftp ? `${athlete.ftp} W` : '—', isForm: false },
        ].map(({ labelKey, value, isForm }) => (
          <Card key={labelKey}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{t(labelKey)}</p>
              <p className="text-2xl font-bold mt-1">{value}</p>
              {isForm && current?.form && (
                <FormBadge form={current.form} />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      </div>

      {/* Fitness history chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">{t('fitnessHistory')}</CardTitle>
          <div className="flex items-center rounded-md border overflow-hidden text-xs">
            {PERIOD_OPTIONS.map(({ label, days: d }) => (
              <button
                key={label}
                className={`px-2.5 py-1.5 transition-colors ${days === d ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                onClick={() => setDays(d)}
              >
                {label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {history && history.length > 0 ? (
            <FitnessChart data={history} />
          ) : (
            <p className="text-sm text-muted-foreground py-12 text-center">
              {t('noHistory')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Weekly TSS */}
      {history && history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('weeklyTss')}</CardTitle>
          </CardHeader>
          <CardContent>
            <WeeklyTssBar data={history} weeks={Math.min(Math.ceil(days / 7), 52)} />
          </CardContent>
        </Card>
      )}

      {/* Recent activities */}
      <div>
        <h2 className="text-lg font-semibold mb-3">{t('recentActivities')}</h2>
        <div className="space-y-2">
          {recentActivities?.items.map((a) => (
            <ActivityCard key={a.id} activity={a} />
          ))}
          {recentActivities?.items.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('noActivities')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
