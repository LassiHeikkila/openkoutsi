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

export function clearTokens() {
  _accessToken = null
}

// Non-sensitive session indicator cookie — contains no secret data.
// Used by the Next.js middleware to gate protected pages before the client-side
// AuthProvider can run. The real security enforcement is always done by the backend.
export function setSessionCookie() {
  if (typeof document !== 'undefined') {
    const maxAge = 30 * 24 * 60 * 60
    document.cookie = `session=1; path=/; max-age=${maxAge}; SameSite=Lax`
  }
}

export function clearSessionCookie() {
  if (typeof document !== 'undefined') {
    document.cookie = 'session=; path=/; max-age=0; SameSite=Lax'
  }
}

async function attemptRefresh(): Promise<boolean> {
  try {
    // Refresh token is in an httpOnly cookie — sent automatically by the browser.
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok) return false
    const data: TokenPair = await res.json()
    setAccessToken(data.access_token)
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

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

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

export async function apiDownload(
  path: string,
  filename: string,
  retry = true,
): Promise<void> {
  const headers: Record<string, string> = {}
  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`
  }

  const res = await fetch(`${API_URL}${path}`, { headers, credentials: 'include' })

  if (res.status === 401 && retry) {
    const refreshed = await attemptRefresh()
    if (refreshed) {
      return apiDownload(path, filename, false)
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

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
