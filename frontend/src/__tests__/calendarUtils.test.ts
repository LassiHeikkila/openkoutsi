import { describe, expect, it } from 'vitest'
import { getDay, format } from 'date-fns'
import {
  getCalendarGrid,
  groupActivitiesByDate,
  monthBounds,
  offsetMonth,
  parseMonthInput,
  formatMonthInput,
} from '@/lib/calendarUtils'
import type { Activity } from '@/lib/types'

function makeActivity(id: string, start_time: string): Activity {
  return {
    id,
    athlete_id: 'a1',
    sources: [],
    name: 'Test',
    sport_type: 'Ride',
    start_time,
    duration_s: 3600,
    distance_m: null,
    elevation_m: null,
    avg_power: null,
    normalized_power: null,
    avg_hr: null,
    max_hr: null,
    tss: null,
    intensity_factor: null,
    workout_category: null,
    has_fit_file: false,
    status: 'done',
    created_at: start_time,
  }
}

describe('getCalendarGrid', () => {
  it('always returns a multiple of 7 cells', () => {
    for (let month = 0; month < 12; month++) {
      const grid = getCalendarGrid(2025, month)
      expect(grid.length % 7).toBe(0)
    }
  })

  it('returns 28, 35, or 42 cells', () => {
    for (let month = 0; month < 12; month++) {
      const grid = getCalendarGrid(2025, month)
      expect([28, 35, 42]).toContain(grid.length)
    }
  })

  it('first cell is always Monday (getDay === 1)', () => {
    for (let month = 0; month < 12; month++) {
      const grid = getCalendarGrid(2025, month)
      expect(getDay(grid[0])).toBe(1)
    }
  })

  it('last cell is always Sunday (getDay === 0)', () => {
    for (let month = 0; month < 12; month++) {
      const grid = getCalendarGrid(2025, month)
      expect(getDay(grid[grid.length - 1])).toBe(0)
    }
  })

  it('March 2025 starts on Saturday — grid starts Monday Feb 24', () => {
    // Use format() (local time) rather than toISOString() (UTC) to avoid timezone shifts
    const grid = getCalendarGrid(2025, 2) // month index 2 = March
    expect(format(grid[0], 'yyyy-MM-dd')).toBe('2025-02-24')
  })

  it('February 2021 fits in exactly 4 weeks (28 cells)', () => {
    // Feb 2021: starts Mon, 28 days — perfect 4 weeks
    const grid = getCalendarGrid(2021, 1)
    expect(grid.length).toBe(28)
  })

  it('December 2024 needs 6 rows (42 cells)', () => {
    // Dec 2024: starts Sunday — grid Mon Nov 25 to Sun Jan 5 = 42 days
    const grid = getCalendarGrid(2024, 11)
    expect(grid.length).toBe(42)
  })
})

describe('groupActivitiesByDate', () => {
  it('returns empty Map for empty array', () => {
    expect(groupActivitiesByDate([]).size).toBe(0)
  })

  it('groups two activities on the same day under the same key', () => {
    const a1 = makeActivity('1', '2025-05-06T08:00:00Z')
    const a2 = makeActivity('2', '2025-05-06T17:00:00Z')
    const map = groupActivitiesByDate([a1, a2])
    expect(map.get('2025-05-06')).toHaveLength(2)
    expect(map.size).toBe(1)
  })

  it('puts activities on different days in separate keys', () => {
    const a1 = makeActivity('1', '2025-05-06T08:00:00Z')
    const a2 = makeActivity('2', '2025-05-07T08:00:00Z')
    const map = groupActivitiesByDate([a1, a2])
    expect(map.size).toBe(2)
    expect(map.get('2025-05-06')).toHaveLength(1)
    expect(map.get('2025-05-07')).toHaveLength(1)
  })

  it('uses start_time.slice(0, 10) as key (ignores time)', () => {
    const a = makeActivity('1', '2025-12-31T23:59:59Z')
    const map = groupActivitiesByDate([a])
    expect(map.has('2025-12-31')).toBe(true)
  })
})

describe('monthBounds', () => {
  it('January 2025: start 2025-01-01, end 2025-01-31', () => {
    expect(monthBounds(2025, 0)).toEqual({ start: '2025-01-01', end: '2025-01-31' })
  })

  it('February 2024 (leap year): end 2024-02-29', () => {
    expect(monthBounds(2024, 1)).toEqual({ start: '2024-02-01', end: '2024-02-29' })
  })

  it('February 2025 (non-leap): end 2025-02-28', () => {
    expect(monthBounds(2025, 1)).toEqual({ start: '2025-02-01', end: '2025-02-28' })
  })

  it('December 2025: end 2025-12-31', () => {
    expect(monthBounds(2025, 11)).toEqual({ start: '2025-12-01', end: '2025-12-31' })
  })
})

describe('offsetMonth', () => {
  it('January + 1 = February same year', () => {
    expect(offsetMonth(2025, 0, 1)).toEqual({ year: 2025, month: 1 })
  })

  it('December + 1 = January next year', () => {
    expect(offsetMonth(2025, 11, 1)).toEqual({ year: 2026, month: 0 })
  })

  it('January - 1 = December previous year', () => {
    expect(offsetMonth(2025, 0, -1)).toEqual({ year: 2024, month: 11 })
  })

  it('June - 1 = May same year', () => {
    expect(offsetMonth(2025, 5, -1)).toEqual({ year: 2025, month: 4 })
  })
})

describe('parseMonthInput', () => {
  it('parses "2025-03" to { year: 2025, month: 2 } (0-indexed)', () => {
    expect(parseMonthInput('2025-03')).toEqual({ year: 2025, month: 2 })
  })

  it('parses "2024-01" to { year: 2024, month: 0 }', () => {
    expect(parseMonthInput('2024-01')).toEqual({ year: 2024, month: 0 })
  })

  it('parses "2025-12" to { year: 2025, month: 11 }', () => {
    expect(parseMonthInput('2025-12')).toEqual({ year: 2025, month: 11 })
  })
})

describe('formatMonthInput', () => {
  it('formats (2025, 2) to "2025-03"', () => {
    expect(formatMonthInput(2025, 2)).toBe('2025-03')
  })

  it('formats (2025, 0) to "2025-01"', () => {
    expect(formatMonthInput(2025, 0)).toBe('2025-01')
  })

  it('formats (2025, 11) to "2025-12"', () => {
    expect(formatMonthInput(2025, 11)).toBe('2025-12')
  })

  it('round-trips with parseMonthInput', () => {
    for (let m = 0; m < 12; m++) {
      expect(parseMonthInput(formatMonthInput(2025, m))).toEqual({ year: 2025, month: m })
    }
  })
})
