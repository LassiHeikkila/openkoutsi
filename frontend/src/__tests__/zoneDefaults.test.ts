import { describe, it, expect } from 'vitest'
import { defaultHrZones, defaultPowerZones } from '@/lib/zoneDefaults'

describe('defaultHrZones', () => {
  it('returns 5 zones', () => {
    expect(defaultHrZones(185)).toHaveLength(5)
  })

  it('first zone starts at 50% of maxHr', () => {
    const zones = defaultHrZones(200)
    expect(zones[0].low).toBe(100)
  })

  it('last zone ends at maxHr', () => {
    const zones = defaultHrZones(185)
    expect(zones[4].high).toBe(185)
  })

  it('zones are contiguous', () => {
    const zones = defaultHrZones(180)
    for (let i = 1; i < zones.length; i++) {
      expect(zones[i].low).toBe(zones[i - 1].high)
    }
  })
})

describe('defaultPowerZones', () => {
  it('returns 7 zones', () => {
    expect(defaultPowerZones(250)).toHaveLength(7)
  })

  it('first zone starts at 0', () => {
    expect(defaultPowerZones(250)[0].low).toBe(0)
  })

  it('last zone ends at 9999', () => {
    const zones = defaultPowerZones(250)
    expect(zones[zones.length - 1].high).toBe(9999)
  })

  it('zones are contiguous', () => {
    const zones = defaultPowerZones(280)
    for (let i = 1; i < zones.length; i++) {
      expect(zones[i].low).toBe(zones[i - 1].high)
    }
  })
})
