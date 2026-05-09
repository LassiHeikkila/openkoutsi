'use client'

import { ThemeProvider } from 'next-themes'
import { SWRConfig } from 'swr'
import { fetcher } from '@/lib/api'
import { Toaster } from '@/components/ui/toaster'
import type { ReactNode } from 'react'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="light-warm" disableTransitionOnChange>
      <SWRConfig value={{ fetcher, revalidateOnFocus: false }}>
        {children}
        <Toaster />
      </SWRConfig>
    </ThemeProvider>
  )
}
