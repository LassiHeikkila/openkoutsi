'use client'

import { SWRConfig } from 'swr'
import { AuthProvider } from '@/lib/auth'
import { fetcher } from '@/lib/api'
import { Toaster } from '@/components/ui/toaster'
import type { ReactNode } from 'react'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ fetcher, revalidateOnFocus: false }}>
      <AuthProvider>
        {children}
        <Toaster />
      </AuthProvider>
    </SWRConfig>
  )
}
