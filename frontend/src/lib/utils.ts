import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${meters.toFixed(0)} m`
}

export function formatPower(watts: number | null | undefined): string {
  if (watts == null) return '—'
  return `${Math.round(watts)} W`
}

export function formatHR(bpm: number | null | undefined): string {
  if (bpm == null) return '—'
  return `${Math.round(bpm)} bpm`
}

/** Format a distance in metres as a human-readable label: 1000 → "1 km", 10000 → "10 km" */
export function formatDistanceLabel(metres: number): string {
  return `${metres / 1000} km`
}

/**
 * Pick a round tick interval (in minutes) that gives roughly 6–10 ticks
 * for the given total duration.
 */
export function niceTickStepMinutes(totalMinutes: number): number {
  if (totalMinutes <= 20)  return 5
  if (totalMinutes <= 60)  return 10
  if (totalMinutes <= 120) return 15
  if (totalMinutes <= 240) return 30
  return 60
}

/** Format a minute value for chart x-axis tick labels: <60 → "45m", ≥60 → "1h 30m" */
export function formatChartTime(minutes: number): string {
  const m = Math.round(minutes)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`
}

/** Format average speed in km/h derived from distance (m) and time (s) */
export function formatSpeedKmh(distance_m: number, time_s: number): string {
  const kmh = (distance_m / time_s) * 3.6
  return `${kmh.toFixed(1)} km/h`
}

/** Format a number of seconds as mm:ss or h:mm:ss */
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
