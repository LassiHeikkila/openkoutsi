'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Interval } from '@/lib/types'
import { formatDuration, formatHR, formatPower } from '@/lib/utils'

interface Props {
  intervals: Interval[]
}

function formatSpeed(speedMs: number | null): string {
  if (speedMs == null) return '—'
  return `${(speedMs * 3.6).toFixed(1)} km/h`
}

export function IntervalsTable({ intervals }: Props) {
  const t = useTranslations('activities.detail.intervals')
  const isAuto = intervals.some((iv) => iv.is_auto_split)

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-semibold">{t('title')}</h3>
        {isAuto && (
          <Badge variant="secondary" className="text-xs">
            {t('auto')}
          </Badge>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">{t('duration')}</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">{t('avgHr')}</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">{t('avgPower')}</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">{t('avgSpeed')}</th>
            </tr>
          </thead>
          <tbody>
            {intervals.map((iv) => (
              <tr key={iv.interval_number} className="border-b border-border last:border-0 hover:bg-muted/20">
                <td className="px-3 py-2 text-muted-foreground">{iv.interval_number}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatDuration(iv.duration_s)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatHR(iv.avg_hr)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatPower(iv.avg_power)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatSpeed(iv.avg_speed_ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
