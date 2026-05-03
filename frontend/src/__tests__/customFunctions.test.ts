import { describe, it, expect } from 'vitest'
import { executeCustomFunction, CustomFunction } from '@/lib/customFunctions'

const info = { duration_s: 3600, ftp: 250, weight_kg: 70 }
const streams = { power: [100, 200, 300], heartrate: [120, 130, 140] }

function makeScalar(body: string): CustomFunction {
  return { id: '1', name: 'test', type: 'scalar', body, createdAt: '' }
}
function makeStream(body: string): CustomFunction {
  return { id: '2', name: 'test', type: 'stream', body, createdAt: '' }
}

describe('executeCustomFunction – scalar', () => {
  it('returns a number result', () => {
    const result = executeCustomFunction(makeScalar('return 42'), streams, info)
    expect(result.error).toBeNull()
    expect(result.type).toBe('scalar')
    expect(result.value).toBe(42)
    expect(result.data).toBeNull()
  })

  it('returns a string result', () => {
    const result = executeCustomFunction(makeScalar('return "hello"'), streams, info)
    expect(result.error).toBeNull()
    expect(result.value).toBe('hello')
  })

  it('can access streams and info', () => {
    const result = executeCustomFunction(
      makeScalar('return streams.power.length + info.ftp'),
      streams,
      info,
    )
    expect(result.error).toBeNull()
    expect(result.value).toBe(3 + 250)
  })

  it('returns error on thrown exception', () => {
    const result = executeCustomFunction(makeScalar('throw new Error("oops")'), streams, info)
    expect(result.error).toContain('oops')
    expect(result.value).toBeNull()
  })

  it('returns error when scalar returns an array', () => {
    const result = executeCustomFunction(makeScalar('return [1, 2, 3]'), streams, info)
    expect(result.error).toMatch(/number or string/)
  })

  it('handles null return gracefully', () => {
    const result = executeCustomFunction(makeScalar('return null'), streams, info)
    expect(result.error).toBeNull()
    expect(result.value).toBeNull()
  })
})

describe('executeCustomFunction – stream', () => {
  it('returns an array result', () => {
    const result = executeCustomFunction(
      makeStream('return streams.power.map(p => p * 2)'),
      streams,
      info,
    )
    expect(result.error).toBeNull()
    expect(result.type).toBe('stream')
    expect(result.data).toEqual([200, 400, 600])
    expect(result.value).toBeNull()
  })

  it('returns error when stream function returns non-array', () => {
    const result = executeCustomFunction(makeStream('return 42'), streams, info)
    expect(result.error).toMatch(/array/)
    expect(result.data).toBeNull()
  })

  it('returns error on thrown exception', () => {
    const result = executeCustomFunction(makeStream('throw new Error("bad")'), streams, info)
    expect(result.error).toContain('bad')
  })
})
