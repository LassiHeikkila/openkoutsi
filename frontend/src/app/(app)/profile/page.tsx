'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import useSWR from 'swr'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { apiFetch, apiDownload, fetcher } from '@/lib/api'
import type { AthleteProfile, Zone } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/use-toast'
import { ZoneEditor } from '@/components/profile/ZoneEditor'
import { ProviderCard } from '@/components/profile/ProviderCard'
import { Suspense } from 'react'

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
  const params = useSearchParams()
  for (const [key, name] of Object.entries(PROVIDER_NAMES)) {
    if (params.get(key) === 'connected') {
      return (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          {name} connected successfully!
        </div>
      )
    }
    if (params.get(key) === 'error') {
      return (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          Could not connect {name}. Please try again.
        </div>
      )
    }
  }
  return null
}

export default function ProfilePage() {
  const { athlete, refreshAthlete } = useAuth()
  const { data: profile } = useSWR<AthleteProfile>('/api/athlete/', fetcher)
  const { data: availableProviders } = useSWR<{ available: string[] }>('/api/integrations/available', fetcher)

  const [name, setName] = useState(athlete?.name ?? '')
  const [weight, setWeight] = useState(athlete?.weight_kg?.toString() ?? '')
  const [ftp, setFtp] = useState(athlete?.ftp?.toString() ?? '')
  const [maxHr, setMaxHr] = useState(athlete?.max_hr?.toString() ?? '')
  const [restingHr, setRestingHr] = useState(athlete?.resting_hr?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [removingAvatar, setRemovingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const [hrZones, setHrZones] = useState<Zone[]>([])
  const [powerZones, setPowerZones] = useState<Zone[]>([])
  const [savingHr, setSavingHr] = useState(false)
  const [savingPower, setSavingPower] = useState(false)

  // Initialise zone editors once profile data arrives
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
      toast({ title: 'Profile picture updated' })
    } catch (err) {
      toast({ title: 'Upload failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' })
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
      toast({ title: 'Profile picture removed' })
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' })
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
      toast({ title: 'Profile saved' })
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unknown error',
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
      toast({ title: 'Heart rate zones saved' })
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' })
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
      toast({ title: 'Power zones saved' })
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setSavingPower(false)
    }
  }

  async function handleExport() {
    try {
      await apiDownload('/api/athlete/export', 'openkoutsi_export.zip')
    } catch (err) {
      toast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'Unknown error',
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
      toast({ title: 'Sync started', description: 'New activities will appear shortly.' })
    } catch (err) {
      toast({
        title: 'Sync failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSyncingProvider(null)
    }
  }

  async function handleProviderDisconnect(provider: string, deleteData: boolean) {
    const name = PROVIDER_NAMES[provider] ?? provider
    const url = `/api/integrations/${provider}/disconnect${deleteData ? '?delete_data=true' : ''}`
    try {
      await apiFetch(url, { method: 'DELETE' })
      await refreshAthlete()
      toast({
        title: `${name} disconnected`,
        description: deleteData ? 'All imported activities have been deleted.' : undefined,
      })
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Profile</h1>

      <Suspense>
        <ProviderNotice />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <div className="relative h-20 w-20 shrink-0 rounded-full overflow-hidden bg-muted border">
              {athlete?.avatar_url ? (
                <Image
                  src={athlete.avatar_url}
                  alt="Profile picture"
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
                {uploadingAvatar ? 'Uploading…' : 'Change picture'}
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
                  {removingAvatar ? 'Removing…' : 'Remove'}
                </Button>
              )}
            </div>
          </div>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weight">Weight (kg)</Label>
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
                <Label htmlFor="ftp">FTP (W)</Label>
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
                <Label htmlFor="maxHr">Max HR (bpm)</Label>
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
                <Label htmlFor="restingHr">Resting HR (bpm)</Label>
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
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Heart rate zones */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Heart rate zones</CardTitle>
          {hrZones.length === 0 && athlete?.max_hr && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setHrZones(defaultHrZones(athlete.max_hr!))}
            >
              Populate from max HR
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {hrZones.length === 0 && !athlete?.max_hr && (
            <p className="text-sm text-muted-foreground">
              Set your max HR above, then use "Populate from max HR" to generate default zones — or add them manually.
            </p>
          )}
          <ZoneEditor zones={hrZones} unit="bpm" onChange={setHrZones} />
          {hrZones.length > 0 && (
            <Button onClick={handleSaveHrZones} disabled={savingHr} size="sm">
              {savingHr ? 'Saving…' : 'Save HR zones'}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Power zones */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Power zones</CardTitle>
          {powerZones.length === 0 && athlete?.ftp && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPowerZones(defaultPowerZones(athlete.ftp!))}
            >
              Populate from FTP
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {powerZones.length === 0 && !athlete?.ftp && (
            <p className="text-sm text-muted-foreground">
              Set your FTP above, then use "Populate from FTP" to generate default zones — or add them manually.
            </p>
          )}
          <ZoneEditor zones={powerZones} unit="W" onChange={setPowerZones} />
          {powerZones.length > 0 && (
            <Button onClick={handleSavePowerZones} disabled={savingPower} size="sm">
              {savingPower ? 'Saving…' : 'Save power zones'}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Connected services */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connected services</CardTitle>
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
            </div>
          ))}
        </CardContent>
      </Card>

      {/* FTP history */}
      {profile?.ftp_tests && profile.ftp_tests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">FTP history</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">FTP</th>
                  <th className="pb-2 font-medium">Method</th>
                </tr>
              </thead>
              <tbody>
                {[...profile.ftp_tests].reverse().map((t, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1.5">{t.date}</td>
                    <td className="py-1.5">{t.ftp} W</td>
                    <td className="py-1.5 capitalize text-muted-foreground">{t.method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      {/* Data export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export your data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Download a ZIP archive containing your profile and all uploaded FIT files.
          </p>
          <Button variant="outline" size="sm" onClick={handleExport}>
            Download export
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
