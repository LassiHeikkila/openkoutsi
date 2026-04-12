'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

export default function RootPage() {
  const { athlete, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      router.replace(athlete ? '/dashboard' : '/login')
    }
  }, [athlete, loading, router])

  return null
}
