'use client'

import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function SettingsPage() {
  const t = useTranslations('app')

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold">{t('settings.title')}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.about.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('settings.about.desc')}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="https://github.com/LassiHeikkila/openkoutsi"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary underline underline-offset-4 hover:opacity-80"
            >
              {t('settings.about.viewOnGitHub')}
            </a>
            <a
              href="https://buymeacoffee.com/koutsi"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
                alt="Buy Me An Energy Gel"
                height={40}
                style={{ height: '40px', width: 'auto' }}
              />
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
