'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/navigation'
import { apiFetch } from '@/lib/api'
import type { TokenPair } from '@/lib/types'

export default function SetupPage() {
  const t = useTranslations('landing')
  const router = useRouter()

  const [teamName, setTeamName] = useState('')
  const [slug, setSlug] = useState('')
  const [adminUsername, setAdminUsername] = useState('')
  const [adminDisplayName, setAdminDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function handleSlugInput(value: string) {
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-'))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await apiFetch<TokenPair>(
        '/api/setup',
        {
          method: 'POST',
          body: JSON.stringify({
            team_name: teamName,
            slug,
            admin_username: adminUsername,
            admin_display_name: adminDisplayName || undefined,
            admin_password: password,
          }),
        },
        false,
      )
      setDone(true)
      setTimeout(() => router.replace(`/t/${slug}/login`), 1500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('setup.failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img src="/logo.svg" alt="" aria-hidden="true" className="h-8 w-8" />
            <span className="text-xl font-semibold">openkoutsi</span>
          </div>
          <h1 className="text-2xl font-bold">{t('setup.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('setup.subtitle')}</p>
        </div>

        {done ? (
          <p className="text-center text-sm text-green-600">{t('setup.success')}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t('setup.teamName')}</label>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={t('setup.teamNamePlaceholder')}
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">{t('setup.slug')}</label>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={t('setup.slugPlaceholder')}
                value={slug}
                onChange={(e) => handleSlugInput(e.target.value)}
                required
                pattern="[a-z0-9-]+"
              />
              <p className="text-xs text-muted-foreground">{t('setup.slugHint')}</p>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">{t('setup.adminUsername')}</label>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={t('setup.adminUsernamePlaceholder')}
                value={adminUsername}
                onChange={(e) => setAdminUsername(e.target.value)}
                required
                autoComplete="username"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">{t('setup.adminDisplayName')}</label>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={t('setup.adminDisplayNamePlaceholder')}
                value={adminDisplayName}
                onChange={(e) => setAdminDisplayName(e.target.value)}
                autoComplete="name"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">{t('setup.password')}</label>
              <input
                type="password"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={t('setup.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? t('setup.submitting') : t('setup.submit')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
