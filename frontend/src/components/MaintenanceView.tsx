'use client'

import { useTranslations } from 'next-intl'
import { useBackendStatus } from '@/lib/backendStatus'

export function MaintenanceView() {
  const t = useTranslations('common')
  const { recheck } = useBackendStatus()

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8 text-center">
      <svg
        viewBox="0 0 200 160"
        className="w-64 h-52"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Ground line */}
        <line x1="10" y1="130" x2="190" y2="130" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />

        {/* Rear wheel */}
        <circle cx="55" cy="110" r="28" fill="none" stroke="currentColor" strokeWidth="3" strokeOpacity="0.7" />
        <circle cx="55" cy="110" r="4" fill="currentColor" strokeOpacity="0.7" />
        {/* Rear spokes */}
        <line x1="55" y1="82" x2="55" y2="138" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />
        <line x1="27" y1="110" x2="83" y2="110" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />
        <line x1="35" y1="90" x2="75" y2="130" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />
        <line x1="75" y1="90" x2="35" y2="130" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />

        {/* Front wheel */}
        <circle cx="145" cy="110" r="28" fill="none" stroke="currentColor" strokeWidth="3" strokeOpacity="0.7" />
        <circle cx="145" cy="110" r="4" fill="currentColor" strokeOpacity="0.7" />
        {/* Front spokes */}
        <line x1="145" y1="82" x2="145" y2="138" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />
        <line x1="117" y1="110" x2="173" y2="110" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />
        <line x1="125" y1="90" x2="165" y2="130" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />
        <line x1="165" y1="90" x2="125" y2="130" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />

        {/* Frame: chainstay (rear axle to BB) */}
        <line x1="55" y1="110" x2="95" y2="100" stroke="currentColor" strokeWidth="3" strokeOpacity="0.8" />
        {/* Frame: seat tube (BB to seat) */}
        <line x1="95" y1="100" x2="85" y2="68" stroke="currentColor" strokeWidth="3" strokeOpacity="0.8" />
        {/* Frame: top tube (seat to head) */}
        <line x1="85" y1="68" x2="128" y2="72" stroke="currentColor" strokeWidth="3" strokeOpacity="0.8" />
        {/* Frame: down tube (BB to head) */}
        <line x1="95" y1="100" x2="128" y2="72" stroke="currentColor" strokeWidth="3" strokeOpacity="0.8" />
        {/* Fork */}
        <line x1="128" y1="72" x2="145" y2="110" stroke="currentColor" strokeWidth="3" strokeOpacity="0.8" />

        {/* Seat */}
        <line x1="85" y1="68" x2="85" y2="60" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.8" />
        <rect x="74" y="55" width="22" height="5" rx="2.5" fill="currentColor" fillOpacity="0.7" />

        {/* Handlebars */}
        <line x1="128" y1="72" x2="130" y2="60" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.8" />
        <line x1="122" y1="57" x2="138" y2="57" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.8" />

        {/* Wrench — floating near the bike */}
        <g transform="translate(152, 32) rotate(35)">
          {/* Handle */}
          <rect x="-3" y="0" width="6" height="22" rx="3" fill="currentColor" fillOpacity="0.6" />
          {/* Head top jaw */}
          <rect x="-7" y="-10" width="14" height="12" rx="2" fill="currentColor" fillOpacity="0.6" />
          {/* Jaw cutout */}
          <rect x="-3" y="-10" width="6" height="7" rx="1" fill="var(--background, white)" />
        </g>

        {/* Small sparkle dots to suggest work in progress */}
        <circle cx="118" cy="45" r="2" fill="currentColor" fillOpacity="0.4" />
        <circle cx="126" cy="38" r="1.5" fill="currentColor" fillOpacity="0.3" />
        <circle cx="134" cy="44" r="1" fill="currentColor" fillOpacity="0.2" />
      </svg>

      <div className="space-y-2 max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">{t('maintenance.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('maintenance.description')}</p>
      </div>

      <button
        onClick={recheck}
        className="mt-2 px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted transition-colors"
      >
        {t('maintenance.retry')}
      </button>
    </div>
  )
}
