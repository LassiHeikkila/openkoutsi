'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { apiFetch, fetcher } from '@/lib/api'
import type { AthleteProfile } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/use-toast'
import { Suspense } from 'react'

function StravaNotice() {
  const params = useSearchParams()
  if (params.get('strava') === 'connected') {
    return (
      <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
        Strava connected successfully!
      </div>
    )
  }
  return null
}

export default function ProfilePage() {
  const { athlete, refreshAthlete } = useAuth()
  const { data: profile } = useSWR<AthleteProfile>('/api/athlete/', fetcher)

  const [name, setName] = useState(athlete?.name ?? '')
  const [weight, setWeight] = useState(athlete?.weight_kg?.toString() ?? '')
  const [ftp, setFtp] = useState(athlete?.ftp?.toString() ?? '')
  const [maxHr, setMaxHr] = useState(athlete?.max_hr?.toString() ?? '')
  const [restingHr, setRestingHr] = useState(athlete?.resting_hr?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)

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

  async function handleStravaConnect() {
    const res = await apiFetch<{ url: string }>('/api/strava/connect')
    window.location.href = res.url
  }

  async function handleStravaSync() {
    setSyncing(true)
    try {
      const res = await apiFetch<{ synced: number }>('/api/strava/sync', { method: 'POST' })
      toast({ title: 'Sync complete', description: `${res.synced} activities synced` })
    } catch (err) {
      toast({
        title: 'Sync failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSyncing(false)
    }
  }

  async function handleStravaDisconnect() {
    try {
      await apiFetch('/api/strava/disconnect', { method: 'DELETE' })
      await refreshAthlete()
      toast({ title: 'Strava disconnected' })
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
        <StravaNotice />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal details</CardTitle>
        </CardHeader>
        <CardContent>
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

      {/* Strava */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Strava integration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {profile?.strava_connected ? (
            <div className="flex items-center gap-3">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm">Connected</span>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" onClick={handleStravaSync} disabled={syncing}>
                  {syncing ? 'Syncing…' : 'Sync now'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/30"
                  onClick={handleStravaDisconnect}
                >
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="inline-block h-2 w-2 rounded-full bg-gray-300" />
              <span className="text-sm text-muted-foreground">Not connected</span>
              <Button size="sm" className="ml-auto" onClick={handleStravaConnect}>
                Connect Strava
              </Button>
            </div>
          )}
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
    </div>
  )
}
