import type { TokenPair } from './types'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

// In-memory access token (not persisted to storage)
let _accessToken: string | null = null

export function setAccessToken(token: string | null) {
  _accessToken = token
}

export function getAccessToken(): string | null {
  return _accessToken
}

export function setRefreshToken(token: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('refresh_token', token)
  }
}

export function getRefreshToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('refresh_token')
  }
  return null
}

export function clearTokens() {
  _accessToken = null
  if (typeof window !== 'undefined') {
    localStorage.removeItem('refresh_token')
  }
}

async function attemptRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false

  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) return false
    const data: TokenPair = await res.json()
    setAccessToken(data.access_token)
    setRefreshToken(data.refresh_token)
    return true
  } catch {
    return false
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }

  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`
  }

  // Don't set Content-Type for FormData — browser sets it with boundary
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json'
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers })

  if (res.status === 401 && retry) {
    const refreshed = await attemptRefresh()
    if (refreshed) {
      return apiFetch<T>(path, options, false)
    }
    clearTokens()
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const err = await res.json()
      message = err.detail ?? err.message ?? message
    } catch {
      // ignore parse errors
    }
    throw new Error(message)
  }

  if (res.status === 204) return undefined as T

  return res.json() as Promise<T>
}

// SWR fetcher
export const fetcher = <T>(path: string) => apiFetch<T>(path)
