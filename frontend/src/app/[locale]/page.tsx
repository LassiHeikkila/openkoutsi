'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import useSWR from 'swr'
import { Link, useRouter } from '@/navigation'
import { apiFetch, fetcher } from '@/lib/api'
import { LocaleSwitcher } from '@/components/LocaleSwitcher'
import './landing.css'

export default function RootPage() {
  const t = useTranslations('landing')
  const router = useRouter()
  const [slug, setSlug] = useState('')
  const [copied, setCopied] = useState(false)
  const [heroTab, setHeroTab] = useState<'signin' | 'create'>('signin')

  // Create-team form state
  const [teamName, setTeamName] = useState('')
  const [teamSlug, setTeamSlug] = useState('')
  const [ctUsername, setCtUsername] = useState('')
  const [ctDisplayName, setCtDisplayName] = useState('')
  const [ctPassword, setCtPassword] = useState('')
  const [ctSubmitting, setCtSubmitting] = useState(false)
  const [ctError, setCtError] = useState('')
  const [ctDone, setCtDone] = useState(false)

  const { data: versionData } = useSWR<{ version: string }>('/api/version', fetcher)
  const { data: setupData } = useSWR<{ needs_setup: boolean }>('/api/setup/status', fetcher)

  useEffect(() => {
    if (setupData?.needs_setup) {
      router.replace('/setup')
    }
  }, [setupData, router])

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

  function handleCopy() {
    navigator.clipboard.writeText(
      'git clone https://github.com/lassiheikkila/openkoutsi\ndocker compose up -d'
    ).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="lp">
      <nav className="nav">
        <div className="container nav-inner">
          <div className="logo">
            <img src="/logo.svg" alt="openkoutsi" className="logo-img" />
            openkoutsi
          </div>
          <div className="nav-right">
            <a href="#features">{t('nav.features')}</a>
            <a href="#selfhost">{t('nav.selfhost')}</a>
            <a href="https://github.com/lassiheikkila/openkoutsi" target="_blank" rel="noopener noreferrer">{t('nav.github')}</a>
            <LocaleSwitcher />
          </div>
        </div>
      </nav>

      <header className="hero">
        <div className="container hero-grid">
          <div>
            <div className="hero-eyebrow">
              <span className="dot" />
              <span>{t('hero.eyebrow')}</span>
              {versionData?.version && (
                <a
                  href="https://github.com/lassiheikkila/openkoutsi/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="version-badge"
                >
                  v{versionData.version}
                </a>
              )}
            </div>
            <h1>
              {t('hero.h1line1')}<br />
              {t('hero.h1line2')}<br />
              <span className="italic">{t('hero.h1line3')}</span>
            </h1>
            <p className="hero-sub">{t('hero.sub')}</p>
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
          </div>

          <div className="hero-viz">
            <div className="viz-label">{t('heroViz.label')}</div>
            <div className="viz-num">
              612<span className="unit">/ 720 target</span>
            </div>
            <div className="viz-chart">
              {/* 8 weeks of bars: actual (accent) + planned (muted). Week 8 = current: 612 actual vs 720 planned. */}
              <svg viewBox="0 0 400 60" preserveAspectRatio="none">
                <rect x="9.5"   y="35" width="14" height="25" fill="var(--lp-accent)" rx="2"/>
                <rect x="26.5"  y="34" width="14" height="26" fill="var(--ink-3)" rx="2" opacity="0.4"/>
                <rect x="59.5"  y="32" width="14" height="28" fill="var(--lp-accent)" rx="2"/>
                <rect x="76.5"  y="33" width="14" height="27" fill="var(--ink-3)" rx="2" opacity="0.4"/>
                <rect x="109.5" y="42" width="14" height="18" fill="var(--lp-accent)" rx="2"/>
                <rect x="126.5" y="39" width="14" height="21" fill="var(--ink-3)" rx="2" opacity="0.4"/>
                <rect x="159.5" y="28" width="14" height="32" fill="var(--lp-accent)" rx="2"/>
                <rect x="176.5" y="30" width="14" height="30" fill="var(--ink-3)" rx="2" opacity="0.4"/>
                <rect x="209.5" y="24" width="14" height="36" fill="var(--lp-accent)" rx="2"/>
                <rect x="226.5" y="26" width="14" height="34" fill="var(--ink-3)" rx="2" opacity="0.4"/>
                <rect x="259.5" y="35" width="14" height="25" fill="var(--lp-accent)" rx="2"/>
                <rect x="276.5" y="32" width="14" height="28" fill="var(--ink-3)" rx="2" opacity="0.4"/>
                <rect x="309.5" y="14" width="14" height="46" fill="var(--lp-accent)" rx="2"/>
                <rect x="326.5" y="16" width="14" height="44" fill="var(--ink-3)" rx="2" opacity="0.4"/>
                <rect x="359.5" y="11" width="14" height="49" fill="var(--lp-accent)" rx="2"/>
                <rect x="376.5" y="2"  width="14" height="58" fill="var(--ink-3)" rx="2" opacity="0.4"/>
              </svg>
            </div>
            <div className="viz-cap">
              <span className="viz-legend-item">
                <span className="viz-legend-dot" style={{ background: 'var(--lp-accent)' }} />
                {t('heroViz.caption1')}
              </span>
              <span className="viz-legend-item">
                <span className="viz-legend-dot" style={{ background: 'var(--ink-3)', opacity: 0.5 }} />
                {t('heroViz.caption2')}
              </span>
            </div>
          </div>
        </div>
      </header>

      <section id="features" className="features">
        <div className="container">
          <div className="feat-grid">
            <div className="feat" style={{ gridColumn: 'span 2' }}>
              <div className="feat-num">{t('features.01.num')}</div>
              <h3>{t('features.01.title')}</h3>
              <p>{t('features.01.body')}</p>
            </div>
            <div className="feat" style={{ gridColumn: 'span 2' }}>
              <div className="feat-num">{t('features.02.num')}</div>
              <h3>{t('features.02.title')}</h3>
              <p>{t('features.02.body')}</p>
            </div>
            <div className="feat" style={{ gridColumn: 'span 2' }}>
              <div className="feat-num">{t('features.03.num')}</div>
              <h3>{t('features.03.title')}</h3>
              <p>{t('features.03.body')}</p>
              <div className="feat-logos">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/strava/api_logo_cptblWith_strava_stack_white.svg" alt="Compatible with Strava" className="feat-logo-strava" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/wahoo/wahoo_logo.png" alt="Wahoo" className="feat-logo-wahoo" />
              </div>
            </div>
            <div className="feat" style={{ gridColumn: 'span 3' }}>
              <div className="feat-num">{t('features.04.num')}</div>
              <h3>{t('features.04.title')}</h3>
              <p>{t('features.04.body')}</p>
            </div>
            <div className="feat" style={{ gridColumn: 'span 3' }}>
              <div className="feat-num">{t('features.05.num')}</div>
              <h3>{t('features.05.title')}</h3>
              <p>{t('features.05.body')}</p>
            </div>
            <div className="feat" style={{ gridColumn: 'span 3' }}>
              <div className="feat-num">{t('features.06.num')}</div>
              <h3>{t('features.06.title')}</h3>
              <p>{t('features.06.body')}</p>
            </div>
            <div className="feat" style={{ gridColumn: 'span 3' }}>
              <div className="feat-num">{t('features.07.num')}</div>
              <h3>{t('features.07.title')}</h3>
              <p>{t('features.07.body')}</p>
            </div>
          </div>
        </div>
      </section>

      <section id="selfhost" className="selfhost">
        <div className="container sh-grid">
          <div className="sh-text">
            <h2>{t('selfhost.title1')}<br />{t('selfhost.title2')}</h2>
            <p>{t('selfhost.body')}</p>
            <div className="pill-row">
              <span className="pill">docker</span>
              <span className="pill">sqlite</span>
              <span className="pill">arm64 / amd64</span>
              <span className="pill">Apache-2.0</span>
            </div>
          </div>
          <div className="snippet-box">
            <div className="snippet-head">
              <div className="dots">
                <span /><span /><span />
              </div>
              <div className="path">~/openkoutsi</div>
              <button className="copy-btn" onClick={handleCopy}>
                {copied ? t('selfhost.copied') : t('selfhost.copy')}
              </button>
            </div>
            <pre
              className="snippet"
              dangerouslySetInnerHTML={{
                __html:
                  '<span class="c"># clone &amp; run</span>\n' +
                  '<span class="k">git clone</span> <span class="s">https://github.com/lassiheikkila/openkoutsi</span>\n' +
                  '<span class="k">docker compose up -d</span>\n\n' +
                  '<span class="c"># open</span>\n' +
                  '<span class="s">http://localhost:8080</span>',
              }}
            />
          </div>
        </div>
      </section>

      <footer>
        <div className="container foot-inner">
          <div>
            <a href="https://github.com/lassiheikkila/openkoutsi" target="_blank" rel="noopener noreferrer">
              <strong style={{ color: 'var(--ink)' }}>openkoutsi</strong>
            </a>{' '}
            · {t('footer.license')} · {t('footer.copyright')}
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <a href="https://github.com/lassiheikkila/openkoutsi" target="_blank" rel="noopener noreferrer">{t('footer.github')}</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
