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
  setTeamSlug,
} from './api'
import type { AthleteProfile, TokenPair } from './types'

interface AuthState {
  athlete: AthleteProfile | null
  loading: boolean
  teamSlug: string
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string, inviteToken: string) => Promise<void>
  logout: () => void
  refreshAthlete: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({
  children,
  teamSlug,
}: {
  children: ReactNode
  teamSlug: string
}) {
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

  useEffect(() => {
    setTeamSlug(teamSlug)

    const restore = async () => {
      if (!getAccessToken()) {
        try {
          const res = await apiFetch<TokenPair>(
            `/api/teams/${teamSlug}/auth/refresh`,
            { method: 'POST' },
            false,
          )
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
  }, [teamSlug, fetchAthlete])

  const login = useCallback(
    async (username: string, password: string) => {
      const data = await apiFetch<TokenPair>(
        `/api/teams/${teamSlug}/auth/login`,
        {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        },
        false,
      )
      setAccessToken(data.access_token)
      setSessionCookie()
      await fetchAthlete()
    },
    [teamSlug, fetchAthlete],
  )

  const register = useCallback(
    async (username: string, password: string, inviteToken: string) => {
      const data = await apiFetch<TokenPair>(
        `/api/teams/${teamSlug}/auth/register`,
        {
          method: 'POST',
          body: JSON.stringify({ username, password, invite_token: inviteToken }),
        },
        false,
      )
      setAccessToken(data.access_token)
      setSessionCookie()
      await fetchAthlete()
    },
    [teamSlug, fetchAthlete],
  )

  const logout = useCallback(() => {
    clearTokens()
    clearSessionCookie()
    setAthlete(null)
    apiFetch(`/api/teams/${teamSlug}/auth/logout`, { method: 'POST' }).catch(() => {})
  }, [teamSlug])

  const refreshAthlete = useCallback(async () => {
    await fetchAthlete()
  }, [fetchAthlete])

  return (
    <AuthContext.Provider
      value={{ athlete, loading, teamSlug, login, register, logout, refreshAthlete }}
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
