'use client'

import { useState } from 'react'
import { Link } from '@/navigation'
import useSWR from 'swr'
import { useTranslations } from 'next-intl'
import { fetcher } from '@/lib/api'
import type { AllTimePowerBests, PowerBestEntry } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PowerCurveChart, formatDuration } from '@/components/charts/PowerCurveChart'

// All 24 standard power durations
const POWER_DURATIONS = [
  1, 3, 5, 10, 15, 30, 45, 60, 120, 180, 300, 480,
  900, 1200, 1800, 2700, 3600, 7200, 10800, 14400,
  18000, 21600, 25200, 28800,
]

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function PowerMedalCell({ entry, rank, unit }: { entry: PowerBestEntry | undefined; rank: number; unit: 'w' | 'wkg' }) {
  const t = useTranslations('app')
  const hiddenClass = rank > 1 ? 'hidden sm:table-cell' : ''
  if (!entry) {
    return <td className={`px-3 py-2 text-center text-muted-foreground text-sm ${hiddenClass}`}>—</td>
  }
  const wkg = unit === 'wkg' && entry.weight_kg ? entry.power_w / entry.weight_kg : null
  return (
    <td className={`px-3 py-2 text-center text-sm ${hiddenClass}`}>
      <Link
        href={`/activities/${entry.activity_id}`}
        className="hover:underline font-medium tabular-nums"
      >
        {unit === 'wkg' && wkg != null
          ? `${wkg.toFixed(2)} W/kg`
          : `${Math.round(entry.power_w)} W`}
      </Link>
      {unit === 'wkg' && wkg == null && (
        <div className="text-xs text-muted-foreground">{t('power.noWeight')}</div>
      )}
      {entry.activity_start_time && (
        <div className="text-xs text-muted-foreground">
          {formatDate(entry.activity_start_time)}
        </div>
      )}
    </td>
  )
}

const MEDAL_HEADERS = [
  <th key="1" className="px-3 py-2 text-center font-medium text-yellow-500 w-32">#1</th>,
  <th key="2" className="hidden sm:table-cell px-3 py-2 text-center font-medium text-slate-400 w-32">#2</th>,
  <th key="3" className="hidden sm:table-cell px-3 py-2 text-center font-medium text-amber-700 w-32">#3</th>,
]

const RANGE_OPTIONS = [
  { label: 'app.power.rangeAll', days: null },
  { label: '12M', days: 365 },
  { label: '6M',  days: 180 },
  { label: '3M',  days: 90  },
] as const

export default function PowerPage() {
  const t = useTranslations('app')
  const [unit, setUnit] = useState<'w' | 'wkg'>('w')
  const [rangeDays, setRangeDays] = useState<number | null>(null)

  const swrKey = rangeDays != null ? `/api/power/bests?days=${rangeDays}` : '/api/power/bests'
  const { data: powerData, isLoading: powerLoading } = useSWR<AllTimePowerBests>(swrKey, fetcher)

  // Power lookup: duration_s → { rank → entry }
  const byDuration = new Map<number, Map<number, PowerBestEntry>>()
  for (const entry of powerData?.bests ?? []) {
    if (!byDuration.has(entry.duration_s)) byDuration.set(entry.duration_s, new Map())
    byDuration.get(entry.duration_s)!.set(entry.rank, entry)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('power.title')}</h1>
        <div className="flex items-center gap-2">
          {/* Time range */}
          <div className="flex items-center rounded-md border overflow-hidden text-sm">
            {RANGE_OPTIONS.map(({ label, days }) => (
              <button
                key={label}
                className={`px-3 py-1.5 transition-colors ${rangeDays === days ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                onClick={() => setRangeDays(days)}
              >
                {label.startsWith('app.') ? t(label.slice(4) as never) : label}
              </button>
            ))}
          </div>
          {/* Unit */}
          <div className="flex items-center rounded-md border overflow-hidden text-sm">
            <button
              className={`px-3 py-1.5 transition-colors ${unit === 'w' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              onClick={() => setUnit('w')}
            >
              W
            </button>
            <button
              className={`px-3 py-1.5 transition-colors ${unit === 'wkg' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              onClick={() => setUnit('wkg')}
            >
              W/kg
            </button>
          </div>
        </div>
      </div>

      {/* Power curve */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('power.curve')}</CardTitle>
        </CardHeader>
        <CardContent>
          {powerLoading ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              {t('power.loading')}
            </div>
          ) : (
            <PowerCurveChart bests={powerData?.bests ?? []} unit={unit} />
          )}
        </CardContent>
      </Card>

      {/* Power all-time bests */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('power.bestPower')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {powerLoading ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">{t('power.loading')}</div>
          ) : byDuration.size === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground px-6 text-center">
              {t('power.noData')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground w-24">{t('power.duration')}</th>
                    {MEDAL_HEADERS}
                  </tr>
                </thead>
                <tbody>
                  {POWER_DURATIONS.map((d) => {
                    const row = byDuration.get(d)
                    if (!row) return null
                    return (
                      <tr key={d} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2 font-mono text-sm text-muted-foreground">{formatDuration(d)}</td>
                        <PowerMedalCell entry={row.get(1)} rank={1} unit={unit} />
                        <PowerMedalCell entry={row.get(2)} rank={2} unit={unit} />
                        <PowerMedalCell entry={row.get(3)} rank={3} unit={unit} />
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
