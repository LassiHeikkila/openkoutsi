'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { fetcher, apiFetch } from '@/lib/api'
import type { AthleteProfile } from '@/lib/types'
import { getLlmConfig } from '@/lib/llm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'

export default function SettingsPage() {
  const { data: athlete, mutate } = useSWR<AthleteProfile>('/api/athlete/', fetcher)

  const autoAnalyze = Boolean(athlete?.app_settings?.auto_analyze)
  const llmConfig = getLlmConfig(athlete?.app_settings)

  // LLM form state — mirrors app_settings fields
  const [llmBaseUrl, setLlmBaseUrl] = useState('')
  const [llmApiKey, setLlmApiKey] = useState('')
  const [llmModel, setLlmModel] = useState('')
  const [llmDirty, setLlmDirty] = useState(false)
  const [llmSaving, setLlmSaving] = useState(false)

  // Initialise form when athlete loads (only once)
  const [llmInitialised, setLlmInitialised] = useState(false)
  if (athlete && !llmInitialised) {
    setLlmBaseUrl((athlete.app_settings?.llm_base_url as string) || '')
    setLlmApiKey((athlete.app_settings?.llm_api_key as string) || '')
    setLlmModel((athlete.app_settings?.llm_model as string) || '')
    setLlmInitialised(true)
  }

  const isHttpsMixed =
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    llmBaseUrl.startsWith('http://')

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

  async function handleSaveLlm() {
    setLlmSaving(true)
    try {
      await apiFetch('/api/athlete/', {
        method: 'PUT',
        body: JSON.stringify({
          app_settings: {
            ...(athlete?.app_settings ?? {}),
            llm_base_url: llmBaseUrl.trim() || null,
            llm_api_key: llmApiKey.trim() || null,
            llm_model: llmModel.trim() || null,
          },
        }),
      })
      setLlmDirty(false)
      mutate()
      toast({ title: 'LLM settings saved' })
    } catch (err) {
      toast({
        title: 'Failed to save LLM settings',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setLlmSaving(false)
    }
  }

  async function handleClearLlm() {
    setLlmSaving(true)
    try {
      await apiFetch('/api/athlete/', {
        method: 'PUT',
        body: JSON.stringify({
          app_settings: {
            ...(athlete?.app_settings ?? {}),
            llm_base_url: null,
            llm_api_key: null,
            llm_model: null,
          },
        }),
      })
      setLlmBaseUrl('')
      setLlmApiKey('')
      setLlmModel('')
      setLlmDirty(false)
      mutate()
      toast({ title: 'LLM settings cleared' })
    } catch (err) {
      toast({
        title: 'Failed to clear LLM settings',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setLlmSaving(false)
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
          <CardTitle className="text-base">AI / LLM</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Connect your own LLM (e.g. a local{' '}
            <span className="font-medium text-foreground">Ollama</span> instance or an
            OpenAI-compatible API) to enable workout analysis and AI plan generation
            directly from your browser. Your API key never leaves your device.
          </p>

          {isHttpsMixed && (
            <div className="rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-700 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              <strong>Mixed content warning:</strong> this page is served over HTTPS but
              your LLM URL starts with <code>http://</code>. Browsers block
              HTTPS→HTTP requests, so analysis calls will fail. Either serve openkoutsi
              over HTTP, or use an HTTPS endpoint for your LLM.
            </div>
          )}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="llm-base-url">Base URL</Label>
              <Input
                id="llm-base-url"
                placeholder="http://localhost:11434/v1"
                value={llmBaseUrl}
                onChange={(e) => { setLlmBaseUrl(e.target.value); setLlmDirty(true) }}
              />
              <p className="text-xs text-muted-foreground">
                OpenAI-compatible endpoint, e.g.{' '}
                <code className="font-mono">http://localhost:11434/v1</code> for Ollama or{' '}
                <code className="font-mono">https://api.openai.com/v1</code>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="llm-model">Model</Label>
              <Input
                id="llm-model"
                placeholder="llama3.2"
                value={llmModel}
                onChange={(e) => { setLlmModel(e.target.value); setLlmDirty(true) }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="llm-api-key">API key <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="llm-api-key"
                type="password"
                placeholder="sk-…  (leave blank for local models)"
                value={llmApiKey}
                onChange={(e) => { setLlmApiKey(e.target.value); setLlmDirty(true) }}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              onClick={handleSaveLlm}
              disabled={!llmDirty || llmSaving}
            >
              {llmSaving ? 'Saving…' : 'Save'}
            </Button>
            {llmConfig && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleClearLlm}
                disabled={llmSaving}
              >
                Clear
              </Button>
            )}
          </div>

          {llmConfig && !llmDirty && (
            <p className="text-xs text-green-600 dark:text-green-400">
              LLM configured — workout analysis and AI plan generation run in your browser.
            </p>
          )}
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
                or synced. Requires an LLM configured above or on the server.
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
