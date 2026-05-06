import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  format,
} from 'date-fns'
import type { Activity } from './types'

/** Returns all Date objects for the Mon-aligned calendar grid of the given month (28/35/42 cells). */
export function getCalendarGrid(year: number, month: number): Date[] {
  const monthStart = startOfMonth(new Date(year, month, 1))
  const monthEnd = endOfMonth(monthStart)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  return eachDayOfInterval({ start: gridStart, end: gridEnd })
}

/** Groups activities by their calendar date (YYYY-MM-DD) using the start_time ISO string. */
export function groupActivitiesByDate(activities: Activity[]): Map<string, Activity[]> {
  const map = new Map<string, Activity[]>()
  for (const a of activities) {
    const key = a.start_time.slice(0, 10)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(a)
  }
  return map
}

/** Returns ISO date strings for the first and last day of the given month. */
export function monthBounds(year: number, month: number): { start: string; end: string } {
  const d = new Date(year, month, 1)
  return {
    start: format(startOfMonth(d), 'yyyy-MM-dd'),
    end: format(endOfMonth(d), 'yyyy-MM-dd'),
  }
}

/** Returns { year, month } shifted by ±1 month; handles year boundaries. month is 0-indexed. */
export function offsetMonth(year: number, month: number, delta: -1 | 1): { year: number; month: number } {
  const d = addMonths(new Date(year, month, 1), delta)
  return { year: d.getFullYear(), month: d.getMonth() }
}

/** Parses an <input type="month"> value "YYYY-MM" into { year, month } (month is 0-indexed). */
export function parseMonthInput(value: string): { year: number; month: number } {
  const [y, m] = value.split('-').map(Number)
  return { year: y, month: m - 1 }
}

/** Formats { year, month } to "YYYY-MM" for use as an <input type="month"> value. */
export function formatMonthInput(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}
