/**
 * Displays the origin source(s) of an activity.
 *
 * Strava-sourced activities must be visually attributed to Strava per the
 * Strava API Terms of Service (section 2.3 — "Strava Attribution").
 */

import Image from 'next/image'

interface Props {
  sources: string[]
  className?: string
}

const SOURCE_LABELS: Record<string, string> = {
  wahoo: 'Wahoo',
  upload: 'FIT upload',
  manual: 'Manual',
}

const BRANDED: Record<string, { bg: string; text: string }> = {
  wahoo: { bg: '#FFD200', text: '#111' },
}

function SingleBadge({ source, className = '' }: { source: string; className?: string }) {
  if (source === 'strava') {
    return (
      <span className={`inline-flex items-center ${className}`}>
        <Image
          src="/strava/api_logo_pwrdBy_strava_horiz_orange.png"
          alt="Powered by Strava"
          width={96}
          height={24}
          className="h-5 w-auto"
        />
      </span>
    )
  }

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

export function SourceBadge({ sources, className = '' }: Props) {
  if (!sources || sources.length === 0) return null

  return (
    <span className="inline-flex items-center gap-1">
      {sources.map((source) => (
        <SingleBadge key={source} source={source} className={className} />
      ))}
    </span>
  )
}
