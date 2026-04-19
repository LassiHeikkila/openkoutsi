'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import './landing.css'

export default function RootPage() {
  const { athlete, loading } = useAuth()
  const router = useRouter()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!loading && athlete) {
      router.replace('/dashboard')
    }
  }, [athlete, loading, router])

  function handleCopy() {
    navigator.clipboard.writeText(
      'git clone https://github.com/lassiheikkila/openkoutsi\ndocker compose up -d'
    ).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Still checking auth — render nothing to avoid flash
  if (loading) return null
  // Authenticated — redirect is in progress
  if (athlete) return null

  return (
    <div className="lp">
      <nav className="nav">
        <div className="container nav-inner">
          <div className="logo">
            <div className="logo-mark" />
            openkoutsi
          </div>
          <div className="nav-right">
            <a href="#features">Features</a>
            <a href="#selfhost">Self-host</a>
            <a href="https://github.com/lassiheikkila/openkoutsi" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
            <Link href="/login" className="btn">Log in</Link>
            <Link href="/register" className="btn btn-primary">Sign up</Link>
          </div>
        </div>
      </nav>

      <header className="hero">
        <div className="container hero-grid">
          <div>
            <div className="hero-eyebrow">
              <span className="dot" />
              <span>open source · AGPL-3.0</span>
            </div>
            <h1>
              Every watt.<br />
              Every kilometre.<br />
              <span className="italic">Yours.</span>
            </h1>
            <p className="hero-sub">
              An open-source training log for cyclists. Self-host it in five minutes, track progression for a lifetime, and never see a paywall.
            </p>
            <div className="hero-actions">
              <Link href="/register" className="btn btn-primary">Get started →</Link>
              <a href="https://github.com/lassiheikkila/openkoutsi" target="_blank" rel="noopener noreferrer" className="btn">GitHub</a>
            </div>
          </div>

          <div className="hero-viz">
            <div className="viz-label">week 14 · TSS</div>
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
              <span>+8.4% on 4-wk avg</span>
              <span>FTP 284W</span>
            </div>
          </div>
        </div>
      </header>

      <section id="features" className="features">
        <div className="container">
          <div className="feat-grid">
            <div className="feat" style={{ gridColumn: 'span 2' }}>
              <div className="feat-num">01 / POWER</div>
              <h3>Power curves, normalized.</h3>
              <p>Mean-maximal power across any date range, season overlays included.</p>
            </div>
            <div className="feat" style={{ gridColumn: 'span 2' }}>
              <div className="feat-num">02 / FORM</div>
              <h3>Fitness, fatigue, form.</h3>
              <p>The Banister model on your real training history — not an estimate.</p>
            </div>
            <div className="feat" style={{ gridColumn: 'span 2' }}>
              <div className="feat-num">03 / IMPORT</div>
              <h3>Bring your history.</h3>
              <p>FIT file upload, Strava and Wahoo integrations — all supported.</p>
            </div>
            <div className="feat" style={{ gridColumn: 'span 3' }}>
              <div className="feat-num">04 / PRIVACY</div>
              <h3>Zero telemetry.</h3>
              <p>No analytics, no third-party SDKs. Your rides stay on your server.</p>
            </div>
            <div className="feat" style={{ gridColumn: 'span 3' }}>
              <div className="feat-num">05 / EXPORT</div>
              <h3>Portable by design.</h3>
              <p>SQLite under the hood. Export your raw FIT files and profile data as JSON — anytime.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="selfhost" className="selfhost">
        <div className="container sh-grid">
          <div className="sh-text">
            <h2>Your server.<br />Your rules.</h2>
            <p>Run openkoutsi anywhere — a Pi in your closet, a €4 VPS, or your home NAS. Docker compose for one-command setup, or build from source. No sign-ups, no pro tier.</p>
            <div className="pill-row">
              <span className="pill">docker</span>
              <span className="pill">sqlite</span>
              <span className="pill">arm64 / amd64</span>
              <span className="pill">AGPL-3.0</span>
            </div>
          </div>
          <div className="snippet-box">
            <div className="snippet-head">
              <div className="dots">
                <span /><span /><span />
              </div>
              <div className="path">~/openkoutsi</div>
              <button className="copy-btn" onClick={handleCopy}>
                {copied ? 'COPIED' : 'COPY'}
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
            · AGPL-3.0 · © 2026 contributors
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <a href="https://github.com/lassiheikkila/openkoutsi" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
