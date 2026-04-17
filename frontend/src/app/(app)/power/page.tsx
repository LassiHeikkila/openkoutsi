'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { fetcher } from '@/lib/api'
import type { AllTimePowerBests, PowerBestEntry } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PowerCurveChart, formatDuration } from '@/components/charts/PowerCurveChart'

// All 24 standard durations — used to build the full table skeleton
const DURATIONS = [
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

function MedalCell({ entry }: { entry: PowerBestEntry | undefined }) {
  if (!entry) {
    return <td className="px-3 py-2 text-center text-muted-foreground text-sm">—</td>
  }
  return (
    <td className="px-3 py-2 text-center text-sm">
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

export default function PowerPage() {
  const { data, isLoading } = useSWR<AllTimePowerBests>('/api/power/bests', fetcher)

  // Build lookup: duration_s → { rank → entry }
  const byDuration = new Map<number, Map<number, PowerBestEntry>>()
  for (const entry of data?.bests ?? []) {
    if (!byDuration.has(entry.duration_s)) {
      byDuration.set(entry.duration_s, new Map())
    }
    byDuration.get(entry.duration_s)!.set(entry.rank, entry)
  }

  const hasAnyData = (data?.bests.length ?? 0) > 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Power</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Power Curve</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : (
            <PowerCurveChart bests={data?.bests ?? []} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All-Time Bests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : !hasAnyData ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground px-6 text-center">
              No power data yet. Upload a workout with a power meter to see your bests.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground w-24">
                      Duration
                    </th>
                    <th className="px-3 py-2 text-center font-medium text-yellow-500 w-32">
                      #1
                    </th>
                    <th className="px-3 py-2 text-center font-medium text-slate-400 w-32">
                      #2
                    </th>
                    <th className="px-3 py-2 text-center font-medium text-amber-700 w-32">
                      #3
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {DURATIONS.map((d) => {
                    const row = byDuration.get(d)
                    // Skip durations with no data at all
                    if (!row) return null
                    return (
                      <tr key={d} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2 font-mono text-sm text-muted-foreground">
                          {formatDuration(d)}
                        </td>
                        <MedalCell entry={row.get(1)} />
                        <MedalCell entry={row.get(2)} />
                        <MedalCell entry={row.get(3)} />
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
