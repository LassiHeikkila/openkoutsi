/**
 * Displays the origin source of an activity.
 *
 * Strava-sourced activities must be visually attributed to Strava per the
 * Strava API Terms of Service (section 2.3 — "Strava Attribution").
 * The orange badge (#FC4C02) uses Strava's official brand colour.
 */

interface Props {
  source: string
  className?: string
}

const SOURCE_LABELS: Record<string, string> = {
  strava: 'Strava',
  upload: 'FIT upload',
  manual: 'Manual',
}

export function SourceBadge({ source, className = '' }: Props) {
  const label = SOURCE_LABELS[source] ?? source

  if (source === 'strava') {
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-[#FC4C02] text-white ${className}`}
      >
        {label}
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground ${className}`}
    >
      {label}
    </span>
  )
}
