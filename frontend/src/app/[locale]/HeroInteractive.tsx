'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/navigation'
import { apiFetch } from '@/lib/api'

export function HeroInteractive() {
  const t = useTranslations('landing')
  const router = useRouter()
  const [slug, setSlug] = useState('')
  const [heroTab, setHeroTab] = useState<'signin' | 'create'>('signin')
  const [teamName, setTeamName] = useState('')
  const [teamSlug, setTeamSlug] = useState('')
  const [ctUsername, setCtUsername] = useState('')
  const [ctDisplayName, setCtDisplayName] = useState('')
  const [ctPassword, setCtPassword] = useState('')
  const [ctSubmitting, setCtSubmitting] = useState(false)
  const [ctError, setCtError] = useState('')
  const [ctDone, setCtDone] = useState(false)

  function handleTeamSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = slug.trim()
    if (trimmed) {
      router.push(`/t/${trimmed}/login`)
    }
  }

  function handleSlugInput(value: string) {
    setTeamSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-'))
  }

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault()
    setCtSubmitting(true)
    setCtError('')
    try {
      await apiFetch('/api/teams', {
        method: 'POST',
        body: JSON.stringify({
          team_name: teamName.trim(),
          slug: teamSlug.trim(),
          admin_username: ctUsername.trim(),
          admin_password: ctPassword,
          admin_display_name: ctDisplayName.trim() || undefined,
        }),
      }, false)
      setCtDone(true)
    } catch (err) {
      setCtError(err instanceof Error ? err.message : t('createTeam.failed'))
    } finally {
      setCtSubmitting(false)
    }
  }

  return (
    <>
      <div className="hero-tabs">
        <button
          className={`hero-tab${heroTab === 'signin' ? ' active' : ''}`}
          onClick={() => setHeroTab('signin')}
          type="button"
        >
          {t('createTeam.tabSignIn')}
        </button>
        <button
          className={`hero-tab${heroTab === 'create' ? ' active' : ''}`}
          onClick={() => setHeroTab('create')}
          type="button"
        >
          {t('createTeam.tabCreate')}
        </button>
      </div>

      {heroTab === 'signin' ? (
        <form onSubmit={handleTeamSubmit} className="hero-actions">
          <input
            type="text"
            className="team-slug-input"
            placeholder={t('teamEntry.placeholder')}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            aria-label={t('teamEntry.label')}
          />
          <button type="submit" className="btn btn-primary" disabled={!slug.trim()}>
            {t('teamEntry.submit')}
          </button>
        </form>
      ) : ctDone ? (
        <div className="ct-success">
          <p className="ct-success-title">{t('createTeam.successTitle')}</p>
          <p className="ct-success-body">{t('createTeam.successBody')}</p>
        </div>
      ) : (
        <form onSubmit={handleCreateTeam} className="ct-form">
          <div className="ct-row">
            <label className="ct-label">{t('createTeam.teamName')}</label>
            <input
              className="ct-input"
              placeholder={t('createTeam.teamNamePlaceholder')}
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              required
            />
          </div>
          <div className="ct-row">
            <label className="ct-label">{t('createTeam.slug')}</label>
            <input
              className="ct-input"
              placeholder={t('createTeam.slugPlaceholder')}
              value={teamSlug}
              onChange={(e) => handleSlugInput(e.target.value)}
              required
            />
            <p className="ct-hint">{t('createTeam.slugHint')}</p>
          </div>
          <div className="ct-row">
            <label className="ct-label">{t('createTeam.adminUsername')}</label>
            <input
              className="ct-input"
              placeholder={t('createTeam.adminUsernamePlaceholder')}
              value={ctUsername}
              onChange={(e) => setCtUsername(e.target.value)}
              required
            />
          </div>
          <div className="ct-row">
            <label className="ct-label">{t('createTeam.adminDisplayName')}</label>
            <input
              className="ct-input"
              placeholder={t('createTeam.adminDisplayNamePlaceholder')}
              value={ctDisplayName}
              onChange={(e) => setCtDisplayName(e.target.value)}
            />
          </div>
          <div className="ct-row">
            <label className="ct-label">{t('createTeam.password')}</label>
            <input
              className="ct-input"
              type="password"
              placeholder={t('createTeam.passwordPlaceholder')}
              value={ctPassword}
              onChange={(e) => setCtPassword(e.target.value)}
              required
            />
          </div>
          {ctError && <p className="ct-error">{ctError}</p>}
          <button type="submit" className="btn btn-primary ct-submit" disabled={ctSubmitting}>
            {ctSubmitting ? t('createTeam.submitting') : t('createTeam.submit')}
          </button>
        </form>
      )}
    </>
  )
}
