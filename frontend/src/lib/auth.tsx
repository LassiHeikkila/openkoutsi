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

function parseJwtRoles(token: string): string[] {
  try {
    const payload = token.split('.')[1]
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const data = JSON.parse(decoded)
    return Array.isArray(data.roles) ? data.roles : []
  } catch {
    return []
  }
}

interface AuthState {
  athlete: AthleteProfile | null
  loading: boolean
  teamSlug: string
  roles: string[]
  isAdmin: boolean
  isCoach: boolean
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
  const [roles, setRoles] = useState<string[]>([])

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
          setRoles(parseJwtRoles(res.access_token))
          setSessionCookie()
        } catch {
          clearTokens()
          setLoading(false)
          return
        }
      } else {
        const existing = getAccessToken()!
        setRoles(parseJwtRoles(existing))
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
      setRoles(parseJwtRoles(data.access_token))
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
      setRoles(parseJwtRoles(data.access_token))
      setSessionCookie()
      await fetchAthlete()
    },
    [teamSlug, fetchAthlete],
  )

  const logout = useCallback(() => {
    clearTokens()
    clearSessionCookie()
    setAthlete(null)
    setRoles([])
    apiFetch(`/api/teams/${teamSlug}/auth/logout`, { method: 'POST' }).catch(() => {})
  }, [teamSlug])

  const refreshAthlete = useCallback(async () => {
    await fetchAthlete()
  }, [fetchAthlete])

  const isAdmin = roles.includes('administrator')
  const isCoach = roles.includes('coach')

  return (
    <AuthContext.Provider
      value={{ athlete, loading, teamSlug, roles, isAdmin, isCoach, login, register, logout, refreshAthlete }}
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
