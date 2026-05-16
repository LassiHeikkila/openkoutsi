'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useRouter } from '@/navigation'
import { useAuth } from '@/lib/auth'
import type { ReactNode } from 'react'

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  const { athlete, loading } = useAuth()
  const router = useRouter()
  const { slug } = useParams<{ slug: string }>()

  useEffect(() => {
    if (!loading && !athlete) {
      router.replace(`/t/${slug}/login`)
    }
  }, [athlete, loading, router, slug])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!athlete) return null

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {children}
      </div>
    </div>
  )
}
