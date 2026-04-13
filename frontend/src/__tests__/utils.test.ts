import { describe, expect, it } from 'vitest'
import {
  cn,
  formatDate,
  formatDistance,
  formatDuration,
  formatHR,
  formatPower,
} from '@/lib/utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('resolves tailwind conflicts (last wins)', () => {
    // tailwind-merge: p-4 and p-2 conflict — p-2 wins
    expect(cn('p-4', 'p-2')).toBe('p-2')
  })

  it('filters falsy values', () => {
    expect(cn('text-red-500', false && 'text-blue-500')).toBe('text-red-500')
    expect(cn('foo', null, undefined, 'bar')).toBe('foo bar')
  })

  it('handles empty input', () => {
    expect(cn()).toBe('')
  })
})

describe('formatDate', () => {
  it('formats a date string into a readable date', () => {
    const result = formatDate('2025-01-15')
    // Should contain the year and day
    expect(result).toContain('2025')
    expect(result).toContain('15')
  })
})

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(3661)).toBe('1h 1m')
    expect(formatDuration(3600)).toBe('1h 0m')
    expect(formatDuration(7320)).toBe('2h 2m')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(90)).toBe('1m 30s')
    expect(formatDuration(60)).toBe('1m 0s')
  })

  it('formats seconds only', () => {
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(1)).toBe('1s')
  })

  it('omits zero hours', () => {
    expect(formatDuration(120)).not.toContain('h')
  })
})

describe('formatDistance', () => {
  it('shows meters for distances under 1 km', () => {
    expect(formatDistance(500)).toBe('500 m')
    expect(formatDistance(999)).toBe('999 m')
  })

  it('shows kilometres for distances >= 1 km', () => {
    expect(formatDistance(1000)).toBe('1.0 km')
    expect(formatDistance(1500)).toBe('1.5 km')
    expect(formatDistance(42195)).toBe('42.2 km')
  })
})

describe('formatPower', () => {
  it('returns dash for null', () => {
    expect(formatPower(null)).toBe('—')
  })

  it('returns dash for undefined', () => {
    expect(formatPower(undefined)).toBe('—')
  })

  it('rounds and appends W', () => {
    expect(formatPower(250)).toBe('250 W')
    expect(formatPower(250.7)).toBe('251 W')
    expect(formatPower(0)).toBe('0 W')
  })
})

describe('formatHR', () => {
  it('returns dash for null', () => {
    expect(formatHR(null)).toBe('—')
  })

  it('returns dash for undefined', () => {
    expect(formatHR(undefined)).toBe('—')
  })

  it('rounds and appends bpm', () => {
    expect(formatHR(148)).toBe('148 bpm')
    expect(formatHR(148.6)).toBe('149 bpm')
    expect(formatHR(0)).toBe('0 bpm')
  })
})
