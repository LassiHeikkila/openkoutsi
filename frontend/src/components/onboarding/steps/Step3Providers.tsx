'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/lib/auth'
import { apiFetch, fetcher } from '@/lib/api'
import { ProviderCard } from '@/components/profile/ProviderCard'
import { WizardShell } from '@/components/onboarding/WizardShell'
import { useCompleteOnboarding } from '@/components/onboarding/useCompleteOnboarding'
import { toast } from '@/components/ui/use-toast'

interface Props {
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}

const PROVIDERS = ['strava', 'wahoo']

export function Step3Providers({ onNext, onBack, onSkip }: Props) {
  const t = useTranslations('onboarding')
  const tCommon = useTranslations('common')
  const { athlete, refreshAthlete } = useAuth()
  const completeOnboarding = useCompleteOnboarding()
  const { data: available } = useSWR<{ available: string[] }>('/api/integrations/available', fetcher)
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null)

  async function handleConnect(provider: string) {
    const res = await apiFetch<{ url: string }>(`/api/integrations/${provider}/connect`)
    window.location.href = res.url
  }

  async function handleSync(provider: string) {
    setSyncingProvider(provider)
    try {
      await apiFetch(`/api/integrations/${provider}/sync`, { method: 'POST' })
    } catch (err) {
      toast({ title: tCommon('error'), description: err instanceof Error ? err.message : tCommon('unknownError'), variant: 'destructive' })
    } finally {
      setSyncingProvider(null)
    }
  }

  async function handleDisconnect(provider: string, deleteData: boolean) {
    try {
      await apiFetch(`/api/integrations/${provider}/disconnect${deleteData ? '?delete_data=true' : ''}`, { method: 'DELETE' })
      await refreshAthlete()
    } catch (err) {
      toast({ title: tCommon('error'), description: err instanceof Error ? err.message : tCommon('unknownError'), variant: 'destructive' })
    }
  }

  return (
    <WizardShell
      step={3}
      title={t('step3.title')}
      onNext={onNext}
      onBack={onBack}
      onSkip={onSkip}
      onSkipAll={completeOnboarding}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('step3.subtitle')}</p>
        <div className="space-y-3">
          {PROVIDERS.map((provider) => (
            <ProviderCard
              key={provider}
              name={provider.charAt(0).toUpperCase() + provider.slice(1)}
              connected={athlete?.connected_providers?.includes(provider) ?? false}
              configured={available?.available?.includes(provider)}
              onConnect={() => handleConnect(provider)}
              onSync={() => handleSync(provider)}
              onDisconnect={(deleteData) => handleDisconnect(provider, deleteData)}
              syncing={syncingProvider === provider}
            />
          ))}
        </div>
      </div>
    </WizardShell>
  )
}
