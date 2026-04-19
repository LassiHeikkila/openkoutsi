'use client'

import Link from 'next/link'
import useSWR from 'swr'
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

function PowerMedalCell({ entry, rank }: { entry: PowerBestEntry | undefined; rank: number }) {
  const hiddenClass = rank > 1 ? 'hidden sm:table-cell' : ''
  if (!entry) {
    return <td className={`px-3 py-2 text-center text-muted-foreground text-sm ${hiddenClass}`}>—</td>
  }
  return (
    <td className={`px-3 py-2 text-center text-sm ${hiddenClass}`}>
      <Link
        href={`/activities/${entry.activity_id}`}
        className="hover:underline font-medium tabular-nums"
      >
        {Math.round(entry.power_w)} W
      </Link>
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

export default function PowerPage() {
  const { data: powerData, isLoading: powerLoading } = useSWR<AllTimePowerBests>('/api/power/bests', fetcher)

  // Power lookup: duration_s → { rank → entry }
  const byDuration = new Map<number, Map<number, PowerBestEntry>>()
  for (const entry of powerData?.bests ?? []) {
    if (!byDuration.has(entry.duration_s)) byDuration.set(entry.duration_s, new Map())
    byDuration.get(entry.duration_s)!.set(entry.rank, entry)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Power</h1>

      {/* Power curve */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Power Curve</CardTitle>
        </CardHeader>
        <CardContent>
          {powerLoading ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : (
            <PowerCurveChart bests={powerData?.bests ?? []} />
          )}
        </CardContent>
      </Card>

      {/* Power all-time bests */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Best Power</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {powerLoading ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">Loading…</div>
          ) : byDuration.size === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground px-6 text-center">
              No power data yet. Upload a workout with a power meter to see your bests.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground w-24">Duration</th>
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
                        <PowerMedalCell entry={row.get(1)} rank={1} />
                        <PowerMedalCell entry={row.get(2)} rank={2} />
                        <PowerMedalCell entry={row.get(3)} rank={3} />
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
