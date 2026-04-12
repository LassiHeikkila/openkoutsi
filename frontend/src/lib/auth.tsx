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
  setRefreshToken,
  clearTokens,
  getRefreshToken,
  getAccessToken,
} from './api'
import type { AthleteProfile, TokenPair } from './types'

interface AuthState {
  athlete: AthleteProfile | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
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

  // On mount, attempt to restore session from refresh token
  useEffect(() => {
    const restore = async () => {
      const rt = getRefreshToken()
      if (!rt) {
        setLoading(false)
        return
      }
      // If we already have an access token in memory (e.g. HMR), skip refresh
      if (!getAccessToken()) {
        try {
          const res = await apiFetch<TokenPair>('/api/auth/refresh', {
            method: 'POST',
            body: JSON.stringify({ refresh_token: rt }),
          })
          setAccessToken(res.access_token)
          setRefreshToken(res.refresh_token)
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
    async (email: string, password: string) => {
      const data = await apiFetch<TokenPair>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      setAccessToken(data.access_token)
      setRefreshToken(data.refresh_token)
      await fetchAthlete()
    },
    [fetchAthlete],
  )

  const register = useCallback(
    async (email: string, password: string) => {
      await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      await login(email, password)
    },
    [login],
  )

  const logout = useCallback(() => {
    clearTokens()
    setAthlete(null)
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
