'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import useSWR from 'swr'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { apiFetch, apiDownload, fetcher } from '@/lib/api'
import type { AthleteProfile, WeightLogEntry, Zone } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/use-toast'
import { ZoneEditor } from '@/components/profile/ZoneEditor'
import { ProviderCard } from '@/components/profile/ProviderCard'
import { Switch } from '@/components/ui/switch'
import { Suspense } from 'react'
import { RefreshCw } from 'lucide-react'

// ── Default zone templates ────────────────────────────────────────────────

function defaultHrZones(maxHr: number): Zone[] {
  return [
    { name: 'Z1 Recovery',   low: Math.round(maxHr * 0.50), high: Math.round(maxHr * 0.60) },
    { name: 'Z2 Endurance',  low: Math.round(maxHr * 0.60), high: Math.round(maxHr * 0.70) },
    { name: 'Z3 Tempo',      low: Math.round(maxHr * 0.70), high: Math.round(maxHr * 0.80) },
    { name: 'Z4 Threshold',  low: Math.round(maxHr * 0.80), high: Math.round(maxHr * 0.90) },
    { name: 'Z5 VO2max',     low: Math.round(maxHr * 0.90), high: maxHr },
  ]
}

function defaultPowerZones(ftp: number): Zone[] {
  return [
    { name: 'Z1 Recovery',      low: 0,                       high: Math.round(ftp * 0.55) },
    { name: 'Z2 Endurance',     low: Math.round(ftp * 0.55),  high: Math.round(ftp * 0.75) },
    { name: 'Z3 Tempo',         low: Math.round(ftp * 0.75),  high: Math.round(ftp * 0.87) },
    { name: 'Z4 Threshold',     low: Math.round(ftp * 0.87),  high: Math.round(ftp * 0.95) },
    { name: 'Z5 VO2max',        low: Math.round(ftp * 0.95),  high: Math.round(ftp * 1.06) },
    { name: 'Z6 Anaerobic',     low: Math.round(ftp * 1.06),  high: Math.round(ftp * 1.20) },
    { name: 'Z7 Neuromuscular', low: Math.round(ftp * 1.20),  high: 9999 },
  ]
}

const PROVIDER_NAMES: Record<string, string> = {
  strava: 'Strava',
  wahoo: 'Wahoo',
}

function ProviderNotice() {
  const t = useTranslations('app')
  const params = useSearchParams()
  for (const [key, name] of Object.entries(PROVIDER_NAMES)) {
    if (params.get(key) === 'connected') {
      return (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          {t('profile.providerConnected', { name })}
        </div>
      )
    }
    if (params.get(key) === 'error') {
      return (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {t('profile.providerError', { name })}
        </div>
      )
    }
  }
  return null
}

export default function ProfilePage() {
  const t = useTranslations('app')
  const tCommon = useTranslations('common')
  const { athlete, refreshAthlete } = useAuth()
  const { data: profile, mutate: mutateProfile } = useSWR<AthleteProfile>('/api/athlete/', fetcher)
  const { data: weightLog } = useSWR<WeightLogEntry[]>('/api/athlete/weight-log', fetcher)
  const { data: availableProviders } = useSWR<{ available: string[] }>('/api/integrations/available', fetcher)

  const [name, setName] = useState(athlete?.name ?? '')
  const [weight, setWeight] = useState(athlete?.weight_kg?.toString() ?? '')
  const [ftp, setFtp] = useState(athlete?.ftp?.toString() ?? '')
  const [maxHr, setMaxHr] = useState(athlete?.max_hr?.toString() ?? '')
  const [restingHr, setRestingHr] = useState(athlete?.resting_hr?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null)
  const [syncingZones, setSyncingZones] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [removingAvatar, setRemovingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const [wahooDeviceOnly, setWahooDeviceOnly] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('wahoo_device_only') === '1'
    }
    return false
  })

  const [hrZones, setHrZones] = useState<Zone[]>([])
  const [powerZones, setPowerZones] = useState<Zone[]>([])
  const [savingHr, setSavingHr] = useState(false)
  const [savingPower, setSavingPower] = useState(false)

  useEffect(() => {
    if (profile) {
      setHrZones(profile.hr_zones ?? [])
      setPowerZones(profile.power_zones ?? [])
    }
  }, [profile])

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    try {
      const form = new FormData()
      form.append('file', file)
      await apiFetch('/api/athlete/avatar', { method: 'POST', body: form })
      await refreshAthlete()
      toast({ title: t('profile.pictureUpdated') })
    } catch (err) {
      toast({ title: t('profile.uploadFailed'), description: err instanceof Error ? err.message : tCommon('unknownError'), variant: 'destructive' })
    } finally {
      setUploadingAvatar(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  async function handleRemoveAvatar() {
    setRemovingAvatar(true)
    try {
      await apiFetch('/api/athlete/avatar', { method: 'DELETE' })
      await refreshAthlete()
      toast({ title: t('profile.pictureRemoved') })
    } catch (err) {
      toast({ title: tCommon('error'), description: err instanceof Error ? err.message : tCommon('unknownError'), variant: 'destructive' })
    } finally {
      setRemovingAvatar(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await apiFetch('/api/athlete/', {
        method: 'PUT',
        body: JSON.stringify({
          name: name || null,
          weight_kg: weight ? parseFloat(weight) : null,
          ftp: ftp ? parseInt(ftp) : null,
          max_hr: maxHr ? parseInt(maxHr) : null,
          resting_hr: restingHr ? parseInt(restingHr) : null,
        }),
      })
      await refreshAthlete()
      toast({ title: t('profile.saved') })
    } catch (err) {
      toast({
        title: t('profile.saveFailed'),
        description: err instanceof Error ? err.message : tCommon('unknownError'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveHrZones() {
    setSavingHr(true)
    try {
      await apiFetch('/api/athlete/', {
        method: 'PUT',
        body: JSON.stringify({ hr_zones: hrZones }),
      })
      toast({ title: t('profile.hrZonesSaved') })
    } catch (err) {
      toast({ title: t('profile.saveFailed'), description: err instanceof Error ? err.message : tCommon('unknownError'), variant: 'destructive' })
    } finally {
      setSavingHr(false)
    }
  }

  async function handleSavePowerZones() {
    setSavingPower(true)
    try {
      await apiFetch('/api/athlete/', {
        method: 'PUT',
        body: JSON.stringify({ power_zones: powerZones }),
      })
      toast({ title: t('profile.powerZonesSaved') })
    } catch (err) {
      toast({ title: t('profile.saveFailed'), description: err instanceof Error ? err.message : tCommon('unknownError'), variant: 'destructive' })
    } finally {
      setSavingPower(false)
    }
  }

  async function handleAutoAnalyzeToggle(checked: boolean) {
    try {
      await apiFetch('/api/athlete/', {
        method: 'PUT',
        body: JSON.stringify({
          app_settings: { ...(profile?.app_settings ?? {}), auto_analyze: checked },
        }),
      })
      mutateProfile()
    } catch (err) {
      toast({
        title: t('settings.analysis.saveFailed'),
        description: err instanceof Error ? err.message : tCommon('unknownError'),
        variant: 'destructive',
      })
    }
  }

  async function handleExport() {
    try {
      await apiDownload('/api/athlete/export', 'openkoutsi_export.zip')
    } catch (err) {
      toast({
        title: t('profile.exportFailed'),
        description: err instanceof Error ? err.message : tCommon('unknownError'),
        variant: 'destructive',
      })
    }
  }

  async function handleProviderConnect(provider: string) {
    const res = await apiFetch<{ url: string }>(`/api/integrations/${provider}/connect`)
    window.location.href = res.url
  }

  async function handleProviderSync(provider: string) {
    setSyncingProvider(provider)
    try {
      await apiFetch(`/api/integrations/${provider}/sync`, { method: 'POST' })
      toast({ title: t('profile.provider.syncStarted'), description: t('profile.provider.syncStartedDesc') })
    } catch (err) {
      toast({
        title: t('profile.provider.syncFailed'),
        description: err instanceof Error ? err.message : tCommon('unknownError'),
        variant: 'destructive',
      })
    } finally {
      setSyncingProvider(null)
    }
  }

  async function handleProviderDisconnect(provider: string, deleteData: boolean) {
    const providerName = PROVIDER_NAMES[provider] ?? provider
    const url = `/api/integrations/${provider}/disconnect${deleteData ? '?delete_data=true' : ''}`
    try {
      await apiFetch(url, { method: 'DELETE' })
      await refreshAthlete()
      toast({
        title: t('profile.provider.disconnected', { name: providerName }),
        description: deleteData ? t('profile.provider.disconnectedWithDelete') : undefined,
      })
    } catch (err) {
      toast({
        title: tCommon('error'),
        description: err instanceof Error ? err.message : tCommon('unknownError'),
        variant: 'destructive',
      })
    }
  }

  async function handleSyncZones(provider: string) {
    const providerName = PROVIDER_NAMES[provider] ?? provider
    setSyncingZones(provider)
    try {
      const res = await apiFetch<{
        updated: string[]
        ftp: number | null
        hr_zones: Zone[] | null
        power_zones: Zone[] | null
      }>(`/api/integrations/${provider}/sync-zones`, { method: 'POST' })
      if (res.ftp != null) setFtp(String(res.ftp))
      await mutateProfile()
      await refreshAthlete()
      toast({ title: t('profile.syncZonesDone', { name: providerName }) })
    } catch (err) {
      const msg = err instanceof Error ? err.message : tCommon('unknownError')
      const isScope = msg.includes('insufficient_scope')
      const isNoZones = msg.includes('no_zones_returned')
      toast({
        title: t('profile.syncZonesFailed', { name: providerName }),
        description: isScope
          ? t('profile.syncZonesReconnect', { name: providerName })
          : isNoZones
          ? t('profile.syncZonesNoData', { name: providerName })
          : msg,
        variant: 'destructive',
      })
    } finally {
      setSyncingZones(null)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">{t('profile.title')}</h1>

      <Suspense>
        <ProviderNotice />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('profile.personalDetails')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <div className="relative h-20 w-20 shrink-0 rounded-full overflow-hidden bg-muted border">
              {athlete?.avatar_url ? (
                <Image
                  src={athlete.avatar_url}
                  alt={t('profile.title')}
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-muted-foreground select-none">
                  {athlete?.name ? athlete.name.charAt(0).toUpperCase() : '?'}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadingAvatar}
                onClick={() => avatarInputRef.current?.click()}
              >
                {uploadingAvatar ? t('profile.uploading') : t('profile.changePicture')}
              </Button>
              {athlete?.avatar_url && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={removingAvatar}
                  className="text-destructive hover:text-destructive"
                  onClick={handleRemoveAvatar}
                >
                  {removingAvatar ? t('profile.removing') : t('profile.remove')}
                </Button>
              )}
            </div>
          </div>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="name">{t('profile.name')}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('profile.namePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weight">{t('profile.weight')}</Label>
                <Input
                  id="weight"
                  type="number"
                  min="30"
                  max="200"
                  step="0.1"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="70"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ftp">{t('profile.ftp')}</Label>
                <Input
                  id="ftp"
                  type="number"
                  min="50"
                  max="600"
                  value={ftp}
                  onChange={(e) => setFtp(e.target.value)}
                  placeholder="250"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxHr">{t('profile.maxHr')}</Label>
                <Input
                  id="maxHr"
                  type="number"
                  min="100"
                  max="220"
                  value={maxHr}
                  onChange={(e) => setMaxHr(e.target.value)}
                  placeholder="185"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="restingHr">{t('profile.restingHr')}</Label>
                <Input
                  id="restingHr"
                  type="number"
                  min="30"
                  max="100"
                  value={restingHr}
                  onChange={(e) => setRestingHr(e.target.value)}
                  placeholder="55"
                />
              </div>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? t('profile.saving') : t('profile.saveChanges')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Sync zones from provider */}
      {profile?.connected_providers && profile.connected_providers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('profile.syncZones')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(
              [
                { provider: 'strava', name: 'Strava' },
                { provider: 'wahoo',  name: 'Wahoo'  },
              ] as const
            )
              .filter(({ provider }) => profile.connected_providers.includes(provider))
              .map(({ provider, name }) => (
                <div key={provider} className="flex items-center justify-between gap-4">
                  <p className="text-sm text-muted-foreground">
                    {name}: {t(`profile.syncZonesProvides.${provider}`)}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={syncingZones !== null}
                    onClick={() => handleSyncZones(provider)}
                    className="shrink-0"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncingZones === provider ? 'animate-spin' : ''}`} />
                    {syncingZones === provider
                      ? t('profile.syncZonesSyncing')
                      : t('profile.syncZonesFrom', { name })}
                  </Button>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* Heart rate zones */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">{t('profile.hrZones')}</CardTitle>
          {hrZones.length === 0 && athlete?.max_hr && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setHrZones(defaultHrZones(athlete.max_hr!))}
            >
              {t('profile.populateFromMaxHr')}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {hrZones.length === 0 && !athlete?.max_hr && (
            <p className="text-sm text-muted-foreground">
              {t('profile.hrZonesHint')}
            </p>
          )}
          <ZoneEditor zones={hrZones} unit="bpm" onChange={setHrZones} />
          {hrZones.length > 0 && (
            <Button onClick={handleSaveHrZones} disabled={savingHr} size="sm">
              {savingHr ? t('profile.savingHrZones') : t('profile.saveHrZones')}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Power zones */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">{t('profile.powerZones')}</CardTitle>
          {powerZones.length === 0 && athlete?.ftp && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPowerZones(defaultPowerZones(athlete.ftp!))}
            >
              {t('profile.populateFromFtp')}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {powerZones.length === 0 && !athlete?.ftp && (
            <p className="text-sm text-muted-foreground">
              {t('profile.powerZonesHint')}
            </p>
          )}
          <ZoneEditor zones={powerZones} unit="W" onChange={setPowerZones} />
          {powerZones.length > 0 && (
            <Button onClick={handleSavePowerZones} disabled={savingPower} size="sm">
              {savingPower ? t('profile.savingPowerZones') : t('profile.savePowerZones')}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Connected services */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('profile.connectedServices')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(
            [
              { provider: 'strava', name: 'Strava' },
              { provider: 'wahoo',  name: 'Wahoo'  },
            ] as const
          ).map(({ provider, name }) => (
            <div key={provider}>
              <p className="text-sm font-medium mb-2">{name}</p>
              <ProviderCard
                name={name}
                connected={profile?.connected_providers?.includes(provider) ?? false}
                configured={availableProviders ? availableProviders.available.includes(provider) : undefined}
                onConnect={() => handleProviderConnect(provider)}
                onSync={() => handleProviderSync(provider)}
                onDisconnect={(deleteData) => handleProviderDisconnect(provider, deleteData)}
                syncing={syncingProvider === provider}
              />
              {provider === 'wahoo' && (
                <div className="mt-2 flex items-center gap-2">
                  <Switch
                    id="wahoo-device-only"
                    checked={wahooDeviceOnly}
                    onCheckedChange={(checked) => {
                      setWahooDeviceOnly(checked)
                      localStorage.setItem('wahoo_device_only', checked ? '1' : '0')
                    }}
                  />
                  <Label htmlFor="wahoo-device-only" className="text-sm cursor-pointer">
                    {t('profile.provider.wahooDeviceOnly')}
                  </Label>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Weight history */}
      {weightLog && weightLog.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('profile.weightHistory')}</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left">
                  <th className="pb-2 font-medium">{t('profile.date')}</th>
                  <th className="pb-2 font-medium">{t('profile.weight')}</th>
                </tr>
              </thead>
              <tbody>
                {weightLog.map((e) => (
                  <tr key={e.date} className="border-t">
                    <td className="py-1.5">{e.date}</td>
                    <td className="py-1.5">{e.weight_kg} kg</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* FTP history */}
      {profile?.ftp_tests && profile.ftp_tests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('profile.ftpHistory')}</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left">
                  <th className="pb-2 font-medium">{t('profile.date')}</th>
                  <th className="pb-2 font-medium">{t('profile.ftp')}</th>
                  <th className="pb-2 font-medium">{t('profile.method')}</th>
                </tr>
              </thead>
              <tbody>
                {[...profile.ftp_tests].reverse().map((test, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1.5">{test.date}</td>
                    <td className="py-1.5">{test.ftp} W</td>
                    <td className="py-1.5 capitalize text-muted-foreground">{test.method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Auto-analyse */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.analysis.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{t('settings.analysis.autoAnalyze')}</p>
              <p className="text-xs text-muted-foreground">
                {t('settings.analysis.autoAnalyzeDesc')}
              </p>
            </div>
            <Switch
              checked={Boolean(profile?.app_settings?.auto_analyze)}
              onCheckedChange={handleAutoAnalyzeToggle}
              disabled={!profile}
            />
          </div>
        </CardContent>
      </Card>

      {/* Data export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('profile.exportData')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {t('profile.exportDesc')}
          </p>
          <Button variant="outline" size="sm" onClick={handleExport}>
            {t('profile.downloadExport')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
