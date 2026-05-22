import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { BackendStatusProvider, useBackendStatus } from '@/lib/backendStatus'
import type { ReactNode } from 'react'

function wrapper({ children }: { children: ReactNode }) {
  return <BackendStatusProvider>{children}</BackendStatusProvider>
}

describe('useBackendStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports backend as up when health check returns 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))
    const { result } = renderHook(() => useBackendStatus(), { wrapper })
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    expect(result.current.isBackendDown).toBe(false)
  })

  it('reports backend as down when health check returns 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })))
    const { result } = renderHook(() => useBackendStatus(), { wrapper })
    await waitFor(() => expect(result.current.isBackendDown).toBe(true))
  })

  it('reports backend as down on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const { result } = renderHook(() => useBackendStatus(), { wrapper })
    await waitFor(() => expect(result.current.isBackendDown).toBe(true))
  })

  it('recovers when backend comes back up', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const { result } = renderHook(() => useBackendStatus(), { wrapper })
    await waitFor(() => expect(result.current.isBackendDown).toBe(true))

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))
    act(() => { result.current.recheck() })
    await waitFor(() => expect(result.current.isBackendDown).toBe(false))
  })
})
