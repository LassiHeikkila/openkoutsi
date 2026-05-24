'use client'

import { useTranslations } from 'next-intl'
import { useBackendStatus } from '@/lib/backendStatus'

export function MaintenanceView() {
  const t = useTranslations('common')
  const { recheck } = useBackendStatus()

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8 text-center">
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
