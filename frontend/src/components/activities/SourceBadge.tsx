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
  wahoo: 'Wahoo',
  upload: 'FIT upload',
  manual: 'Manual',
}

// Brand colours for providers that require visual attribution per their ToS
const BRANDED: Record<string, { bg: string; text: string }> = {
  strava: { bg: '#FC4C02', text: 'white' },   // Strava API ToS §2.3
  wahoo:  { bg: '#FFD200', text: '#111'   },   // Wahoo brand yellow
}

export function SourceBadge({ source, className = '' }: Props) {
  const label = SOURCE_LABELS[source] ?? source
  const brand = BRANDED[source]

  if (brand) {
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}
        style={{ backgroundColor: brand.bg, color: brand.text }}
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
