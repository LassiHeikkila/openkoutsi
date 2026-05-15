import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { LocaleSwitcher } from '@/components/LocaleSwitcher'
import { HeroInteractive } from './HeroInteractive'
import { CopyButton } from './CopyButton'
import './landing.css'

type Props = { params: Promise<{ locale: string }> }

const TITLE = 'openkoutsi — open-source cycling training log'
const DESCRIPTION =
  'An open-source training log for cyclists. Self-host it in five minutes, track progression for a lifetime, and never see a paywall.'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? ''

  return {
    title: TITLE,
    description: DESCRIPTION,
    metadataBase: base ? new URL(base) : undefined,
    alternates: {
      canonical: `${base}/${locale}`,
      languages: {
        en: `${base}/en`,
        fi: `${base}/fi`,
        'x-default': `${base}/en`,
      },
    },
    openGraph: {
      type: 'website',
      url: `${base}/${locale}`,
      siteName: 'openkoutsi',
      title: TITLE,
      description: DESCRIPTION,
    },
    twitter: {
      card: 'summary_large_image',
      title: TITLE,
      description: DESCRIPTION,
    },
  }
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'openkoutsi',
  applicationCategory: 'SportsApplication',
  description: DESCRIPTION,
  url: 'https://github.com/lassiheikkila/openkoutsi',
  license: 'https://spdx.org/licenses/Apache-2.0.html',
  operatingSystem: 'Linux, macOS, Windows',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
}

export default async function RootPage() {
  const t = await getTranslations('landing')

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

  const [setupResult, versionResult] = await Promise.allSettled([
    fetch(`${apiUrl}/api/setup/status`, { cache: 'no-store' }).then((r) => r.json()),
    fetch(`${apiUrl}/api/version`, { next: { revalidate: 3600 } }).then((r) => r.json()),
  ])

  const setupData = setupResult.status === 'fulfilled' ? setupResult.value : null
  const versionData = versionResult.status === 'fulfilled' ? versionResult.value : null

  if (setupData?.needs_setup) {
    redirect('/setup')
  }

  const version = versionData?.version as string | undefined

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="lp">
        <nav className="nav">
          <div className="container nav-inner">
            <div className="logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="openkoutsi" className="logo-img" />
              openkoutsi
            </div>
            <div className="nav-right">
              <a href="#features">{t('nav.features')}</a>
              <a href="#selfhost">{t('nav.selfhost')}</a>
              <a
                href="https://github.com/lassiheikkila/openkoutsi"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('nav.github')}
              </a>
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
                {version && (
                  <a
                    href="https://github.com/lassiheikkila/openkoutsi/releases"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="version-badge"
                  >
                    v{version}
                  </a>
                )}
              </div>
              <h1>
                {t('hero.h1line1')}
                <br />
                {t('hero.h1line2')}
                <br />
                <span className="italic">{t('hero.h1line3')}</span>
              </h1>
              <p className="hero-sub">{t('hero.sub')}</p>
              <HeroInteractive />
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
                  <span
                    className="viz-legend-dot"
                    style={{ background: 'var(--ink-3)', opacity: 0.5 }}
                  />
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
                  <img
                    src="/strava/api_logo_cptblWith_strava_stack_black.svg"
                    alt="Compatible with Strava"
                    className="feat-logo-strava"
                  />
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
              <h2>
                {t('selfhost.title1')}
                <br />
                {t('selfhost.title2')}
              </h2>
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
                  <span />
                  <span />
                  <span />
                </div>
                <div className="path">~/openkoutsi</div>
                <CopyButton />
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
              <a
                href="https://github.com/lassiheikkila/openkoutsi"
                target="_blank"
                rel="noopener noreferrer"
              >
                <strong style={{ color: 'var(--ink)' }}>openkoutsi</strong>
              </a>{' '}
              · {t('footer.license')} · {t('footer.copyright')}
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
              <a
                href="https://github.com/lassiheikkila/openkoutsi"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('footer.github')}
              </a>
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}
