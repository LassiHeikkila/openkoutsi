import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { BackendStatusProvider, useBackendStatus } from '@/lib/backendStatus'
import type { ReactNode } from 'react'

const wrapper = ({ children }: { children: ReactNode }) =>
  React.createElement(BackendStatusProvider, { children })

describe('useBackendStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('isBackendDown is false when health check returns 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    const { result } = renderHook(() => useBackendStatus(), { wrapper })
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    expect(result.current.isBackendDown).toBe(false)
  })

  it('isBackendDown is true when health check returns non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const { result } = renderHook(() => useBackendStatus(), { wrapper })
    await waitFor(() => expect(result.current.isBackendDown).toBe(true))
  })

  it('isBackendDown is true when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const { result } = renderHook(() => useBackendStatus(), { wrapper })
    await waitFor(() => expect(result.current.isBackendDown).toBe(true))
  })

  it('isBackendDown recovers when recheck is called after backend comes back', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const { result } = renderHook(() => useBackendStatus(), { wrapper })
    await waitFor(() => expect(result.current.isBackendDown).toBe(true))

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    result.current.recheck()
    await waitFor(() => expect(result.current.isBackendDown).toBe(false))
  })
})
