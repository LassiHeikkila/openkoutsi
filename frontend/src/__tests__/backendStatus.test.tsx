import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { BackendStatusProvider, useBackendStatus } from '@/lib/backendStatus'
import type { ReactNode } from 'react'

function wrapper({ children }: { children: ReactNode }) {
  return <BackendStatusProvider>{children}</BackendStatusProvider>
}

function mockFetchResponse(status: number): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(null, { status })),
  )
}

function mockFetchNetworkError(): void {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
}

describe('useBackendStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('reports backend as up when health check returns 200', async () => {
    mockFetchResponse(200)
    const { result } = renderHook(() => useBackendStatus(), { wrapper })
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalled()
    })
    expect(result.current.isBackendDown).toBe(false)
  })

  it('reports backend as down when health check returns 500', async () => {
    mockFetchResponse(500)
    const { result } = renderHook(() => useBackendStatus(), { wrapper })
    await waitFor(() => {
      expect(result.current.isBackendDown).toBe(true)
    })
  })

  it('reports backend as down on network error', async () => {
    mockFetchNetworkError()
    const { result } = renderHook(() => useBackendStatus(), { wrapper })
    await waitFor(() => {
      expect(result.current.isBackendDown).toBe(true)
    })
  })

  it('recovers when backend comes back up', async () => {
    mockFetchNetworkError()
    const { result } = renderHook(() => useBackendStatus(), { wrapper })
    await waitFor(() => {
      expect(result.current.isBackendDown).toBe(true)
    })

    mockFetchResponse(200)
    await act(async () => {
      result.current.recheck()
    })
    await waitFor(() => {
      expect(result.current.isBackendDown).toBe(false)
    })
  })
})
