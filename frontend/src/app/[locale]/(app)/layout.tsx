'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/navigation'
import { useAuth } from '@/lib/auth'
import { Nav } from '@/components/Nav'
import { Menu } from 'lucide-react'
import type { ReactNode } from 'react'

export default function AppLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('common')
  const { athlete, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    if (!loading && !athlete) {
      router.replace('/')
    }
  }, [athlete, loading, router])

  // Close mobile nav on route change
  useEffect(() => {
    setNavOpen(false)
  }, [pathname])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        {t('loading')}
      </div>
    )
  }

  if (!athlete) return null

  return (
    <div className="flex h-screen overflow-hidden">
      <Nav open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
          <button
            onClick={() => setNavOpen(true)}
            className="p-1 rounded text-muted-foreground hover:text-foreground"
            aria-label={t('nav.openNavigation')}
          >
            <Menu className="h-5 w-5" />
          </button>
          <img src="/logo.svg" alt="" aria-hidden="true" className="h-5 w-5" />
          <p className="font-semibold text-sm">openkoutsi</p>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
