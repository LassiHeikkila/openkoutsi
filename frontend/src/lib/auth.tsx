'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import {
  apiFetch,
  setAccessToken,
  clearTokens,
  getAccessToken,
  setSessionCookie,
  clearSessionCookie,
} from './api'
import type { AthleteProfile, TokenPair } from './types'

interface AuthState {
  athlete: AthleteProfile | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  logout: () => void
  refreshAthlete: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchAthlete = useCallback(async () => {
    try {
      const data = await apiFetch<AthleteProfile>('/api/athlete/')
      setAthlete(data)
    } catch {
      setAthlete(null)
    }
  }, [])

  // On mount, attempt to restore session via the httpOnly refresh cookie.
  // If the cookie is present and valid the refresh endpoint returns a new
  // access token; if not, we get a 401 and stay logged out.
  useEffect(() => {
    const restore = async () => {
      // Skip if we already have an access token in memory (e.g. hot reload)
      if (!getAccessToken()) {
        try {
          const res = await apiFetch<TokenPair>('/api/auth/refresh', {
            method: 'POST',
          })
          setAccessToken(res.access_token)
          setSessionCookie()
        } catch {
          clearTokens()
          setLoading(false)
          return
        }
      }
      await fetchAthlete()
      setLoading(false)
    }
    restore()
  }, [fetchAthlete])

  const login = useCallback(
    async (username: string, password: string) => {
      const data = await apiFetch<TokenPair>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      setAccessToken(data.access_token)
      setSessionCookie()
      await fetchAthlete()
    },
    [fetchAthlete],
  )

  const register = useCallback(
    async (username: string, password: string) => {
      await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      await login(username, password)
    },
    [login],
  )

  const logout = useCallback(() => {
    clearTokens()
    clearSessionCookie()
    setAthlete(null)
    // Clear the httpOnly refresh cookie server-side
    apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
  }, [])

  const refreshAthlete = useCallback(async () => {
    await fetchAthlete()
  }, [fetchAthlete])

  return (
    <AuthContext.Provider
      value={{ athlete, loading, login, register, logout, refreshAthlete }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
