'use client'

import { AuthProvider } from '@/lib/auth'
import type { ReactNode } from 'react'

export function TeamProviders({
  children,
  teamSlug,
}: {
  children: ReactNode
  teamSlug: string
}) {
  return <AuthProvider teamSlug={teamSlug}>{children}</AuthProvider>
}
