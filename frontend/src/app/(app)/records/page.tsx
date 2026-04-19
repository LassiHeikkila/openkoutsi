'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { fetcher } from '@/lib/api'
import type { AllTimeDistanceBests, DistanceBestEntry } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDistanceLabel, formatTime, formatSpeedKmh } from '@/lib/utils'

// All 20 standard distances (metres)
const DISTANCE_DISTANCES = [
  1_000, 2_000, 3_000, 5_000, 8_000,
  10_000, 20_000, 30_000, 40_000, 50_000,
  60_000, 70_000, 80_000, 90_000, 100_000,
  110_000, 120_000, 130_000, 140_000, 150_000,
]

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function DistanceMedalCell({ entry, rank }: { entry: DistanceBestEntry | undefined; rank: number }) {
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
        {formatTime(entry.time_s)}
      </Link>
      <div className="text-xs text-muted-foreground tabular-nums">
        {formatSpeedKmh(entry.distance_m, entry.time_s)}
      </div>
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

export default function RecordsPage() {
  const { data: distanceData, isLoading } = useSWR<AllTimeDistanceBests>('/api/distance/bests', fetcher)

  const byDistance = new Map<number, Map<number, DistanceBestEntry>>()
  for (const entry of distanceData?.bests ?? []) {
    if (!byDistance.has(entry.distance_m)) byDistance.set(entry.distance_m, new Map())
    byDistance.get(entry.distance_m)!.set(entry.rank, entry)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Distance Records</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Best Times</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">Loading…</div>
          ) : byDistance.size === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground px-6 text-center">
              No distance data yet. Upload a workout with a GPS track to see your records.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground w-24">Distance</th>
                    {MEDAL_HEADERS}
                  </tr>
                </thead>
                <tbody>
                  {DISTANCE_DISTANCES.map((d) => {
                    const row = byDistance.get(d)
                    if (!row) return null
                    return (
                      <tr key={d} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2 font-mono text-sm text-muted-foreground">{formatDistanceLabel(d)}</td>
                        <DistanceMedalCell entry={row.get(1)} rank={1} />
                        <DistanceMedalCell entry={row.get(2)} rank={2} />
                        <DistanceMedalCell entry={row.get(3)} rank={3} />
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
