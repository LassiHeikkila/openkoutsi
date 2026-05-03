import { describe, it, expect } from 'vitest'
import { totalEnergyKj, normalizedPower, rollingAverage } from '@/lib/streamAnalytics'

describe('totalEnergyKj', () => {
  it('returns null when no power stream', () => {
    expect(totalEnergyKj({})).toBeNull()
    expect(totalEnergyKj({ heartrate: [120, 130] })).toBeNull()
  })

  it('returns null for empty power array', () => {
    expect(totalEnergyKj({ power: [] })).toBeNull()
  })

  it('computes correct energy for constant power', () => {
    // 200 W * 3600 s = 720,000 J = 720 kJ
    const power = new Array(3600).fill(200)
    expect(totalEnergyKj({ power })).toBe(720)
  })

  it('rounds to nearest kJ', () => {
    // 1500 W * 1s = 1.5 kJ → rounds to 2
    expect(totalEnergyKj({ power: [1500] })).toBe(2)
  })
})

describe('normalizedPower', () => {
  it('returns null when no power stream', () => {
    expect(normalizedPower({})).toBeNull()
  })

  it('returns null for streams shorter than 30 seconds', () => {
    expect(normalizedPower({ power: new Array(29).fill(300) })).toBeNull()
  })

  it('returns the same value for perfectly constant power', () => {
    // NP of constant power should equal that power
    const power = new Array(300).fill(250)
    expect(normalizedPower({ power })).toBe(250)
  })
})

describe('rollingAverage', () => {
  it('returns same-length array', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const result = rollingAverage(data, 3)
    expect(result).toHaveLength(10)
  })

  it('first (window-1) values are NaN', () => {
    const result = rollingAverage([1, 2, 3, 4, 5], 3)
    expect(isNaN(result[0])).toBe(true)
    expect(isNaN(result[1])).toBe(true)
  })

  it('computes correct steady-state average', () => {
    // [2, 2, 2, 2, 2] with window 3 → [NaN, NaN, 2, 2, 2]
    const result = rollingAverage([2, 2, 2, 2, 2], 3)
    expect(result[2]).toBe(2)
    expect(result[3]).toBe(2)
    expect(result[4]).toBe(2)
  })

  it('computes average of ramp correctly', () => {
    // [1, 2, 3, 4, 5] window 3 → avg of 1+2+3=2, 2+3+4=3, 3+4+5=4
    const result = rollingAverage([1, 2, 3, 4, 5], 3)
    expect(result[2]).toBe(2)
    expect(result[3]).toBe(3)
    expect(result[4]).toBe(4)
  })

  it('returns copy of data for window <= 0', () => {
    const data = [1, 2, 3]
    const result = rollingAverage(data, 0)
    expect(result).toEqual([1, 2, 3])
  })
})
