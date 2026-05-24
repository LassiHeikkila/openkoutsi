'use client'

import { AuthProvider } from '@/lib/auth'
import { BackendStatusProvider, useBackendStatus } from '@/lib/backendStatus'
import { MaintenanceView } from '@/components/MaintenanceView'
import type { ReactNode } from 'react'

function BackendStatusGate({ children }: { children: ReactNode }) {
  const { isBackendDown } = useBackendStatus()
  if (isBackendDown) return <MaintenanceView />
  return <>{children}</>
}

export function TeamProviders({
  children,
  teamSlug,
}: {
  children: ReactNode
  teamSlug: string
}) {
  return (
    <BackendStatusProvider>
      <BackendStatusGate>
        <AuthProvider teamSlug={teamSlug}>{children}</AuthProvider>
      </BackendStatusGate>
    </BackendStatusProvider>
  )
}
