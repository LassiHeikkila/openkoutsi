'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { Nav } from '@/components/Nav'
import type { ReactNode } from 'react'

export default function AppLayout({ children }: { children: ReactNode }) {
  const { athlete, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !athlete) {
      router.replace('/login')
    }
  }, [athlete, loading, router])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!athlete) return null

  return (
    <div className="flex h-screen overflow-hidden">
      <Nav />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  )
}
