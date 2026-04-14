'use client'

import useSWR from 'swr'
import { fetcher, apiFetch } from '@/lib/api'
import type { AthleteProfile } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/use-toast'

export default function SettingsPage() {
  const { data: athlete, mutate } = useSWR<AthleteProfile>('/api/athlete/', fetcher)

  const autoAnalyze = Boolean(athlete?.app_settings?.auto_analyze)

  async function handleAutoAnalyzeToggle(checked: boolean) {
    try {
      await apiFetch('/api/athlete/', {
        method: 'PUT',
        body: JSON.stringify({
          app_settings: { ...(athlete?.app_settings ?? {}), auto_analyze: checked },
        }),
      })
      mutate()
    } catch (err) {
      toast({
        title: 'Failed to save setting',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            openkoutsi is an open-source endurance training companion. It lets you upload
            and analyse workouts from FIT files or Strava, track fitness metrics like CTL,
            ATL and TSB over time, manage heart rate and power zones, set goals, and
            generate personalised training plans — all from a self-hosted instance you
            control.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="https://github.com/LassiHeikkila/openkoutsi"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary underline underline-offset-4 hover:opacity-80"
            >
              View on GitHub
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Analysis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Auto-analyse workouts</p>
              <p className="text-xs text-muted-foreground">
                Automatically generate AI coaching analysis when a workout is uploaded
                or synced from Strava. Requires an LLM to be configured on the server.
              </p>
            </div>
            <Switch
              checked={autoAnalyze}
              onCheckedChange={handleAutoAnalyzeToggle}
              disabled={!athlete}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
