import { describe, expect, it } from 'vitest'

import { messageTypeKey } from '@/lib/messages'

describe('messageTypeKey', () => {
  it('returns the type for known message types', () => {
    expect(messageTypeKey('team_request')).toBe('team_request')
    expect(messageTypeKey('invite_used')).toBe('invite_used')
    expect(messageTypeKey('join_request')).toBe('join_request')
  })

  it('falls back to "unknown" for unrecognised types', () => {
    expect(messageTypeKey('something_else')).toBe('unknown')
    expect(messageTypeKey('')).toBe('unknown')
  })
})
