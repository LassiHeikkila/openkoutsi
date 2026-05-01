'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import useSWR from 'swr'
import { Link, useRouter } from '@/navigation'
import { fetcher } from '@/lib/api'
import { LocaleSwitcher } from '@/components/LocaleSwitcher'
import './landing.css'

export default function RootPage() {
  const t = useTranslations('landing')
  const router = useRouter()
  const [slug, setSlug] = useState('')
  const [copied, setCopied] = useState(false)
  const { data: versionData } = useSWR<{ version: string }>('/api/version', fetcher)

  function handleTeamSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = slug.trim()
    if (trimmed) {
      router.push(`/t/${trimmed}/login`)
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
          </div>

          <div className="hero-viz">
            <div className="viz-label">{t('heroViz.label')}</div>
            <div className="viz-num">
              612<span className="unit">/ 720 target</span>
            </div>
            <div className="viz-chart">
              <svg viewBox="0 0 400 60" preserveAspectRatio="none">
                <line x1="0" y1="15" x2="400" y2="15" stroke="var(--line)" strokeDasharray="2 4" />
                <line x1="0" y1="35" x2="400" y2="35" stroke="var(--line)" strokeDasharray="2 4" />
                <polyline
                  points="0,45 50,40 100,42 150,34 200,38 250,24 300,28 350,18 400,10"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                />
                <circle cx="400" cy="10" r="4" fill="var(--accent)" />
                <circle cx="400" cy="10" r="9" fill="var(--accent)" opacity="0.25" />
              </svg>
            </div>
            <div className="viz-cap">
              <span>{t('heroViz.caption1')}</span>
              <span>{t('heroViz.caption2')}</span>
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
