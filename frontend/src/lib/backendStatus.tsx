'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { API_URL } from './api'

interface BackendStatusContextValue {
  isBackendDown: boolean
  recheck: () => void
}

const BackendStatusContext = createContext<BackendStatusContextValue>({
  isBackendDown: false,
  recheck: () => {},
})

export function BackendStatusProvider({ children }: { children: ReactNode }) {
  const [isBackendDown, setIsBackendDown] = useState(false)

  const check = useCallback(async () => {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const res = await fetch(`${API_URL}/api/health`, {
        signal: controller.signal,
        cache: 'no-store',
      })
      clearTimeout(timeout)
      setIsBackendDown(!res.ok)
    } catch {
      setIsBackendDown(true)
    }
  }, [])

  useEffect(() => {
    check()
    const interval = setInterval(check, 30_000)
    return () => clearInterval(interval)
  }, [check])

  return (
    <BackendStatusContext.Provider value={{ isBackendDown, recheck: check }}>
      {children}
    </BackendStatusContext.Provider>
  )
}

export function useBackendStatus() {
  return useContext(BackendStatusContext)
}
