'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { usePathname, useRouter } from '@/navigation'
import { useAuth } from '@/lib/auth'
import { apiFetch } from '@/lib/api'
import { Nav } from '@/components/Nav'
import { Menu } from 'lucide-react'
import type { ReactNode } from 'react'

export default function AppLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('common')
  const locale = useLocale()
  const { athlete, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const { slug } = useParams<{ slug: string }>()
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    if (!loading && !athlete) {
      router.replace(`/t/${slug}/login`)
    }
  }, [athlete, loading, router, slug])

  useEffect(() => {
    if (!loading && athlete) {
      const done = (athlete.app_settings as Record<string, unknown>)?.onboarding_completed
      if (!done && !pathname.includes('/onboarding')) {
        router.replace(`/t/${slug}/onboarding?step=0`)
      }
    }
  }, [athlete, loading, pathname, router, slug])

  // Persist locale in app_settings so backend jobs (auto-analysis) can use it
  useEffect(() => {
    if (athlete && (athlete.app_settings as Record<string, unknown>)?.locale !== locale) {
      apiFetch('/api/athlete/', {
        method: 'PATCH',
        body: JSON.stringify({ app_settings: { locale } }),
      }).catch(() => {})
    }
  }, [locale, athlete])

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
