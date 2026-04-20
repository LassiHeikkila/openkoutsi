'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('app')
  const tCommon = useTranslations('common')
  const { data: athlete, mutate } = useSWR<AthleteProfile>('/api/athlete/', fetcher)

  const autoAnalyze = Boolean(athlete?.app_settings?.auto_analyze)
  const llmConfig = getLlmConfig(athlete?.app_settings)

  const [llmBaseUrl, setLlmBaseUrl] = useState('')
  const [llmApiKey, setLlmApiKey] = useState('')
  const [llmModel, setLlmModel] = useState('')
  const [llmDirty, setLlmDirty] = useState(false)
  const [llmSaving, setLlmSaving] = useState(false)

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
        title: t('settings.analysis.saveFailed'),
        description: err instanceof Error ? err.message : tCommon('unknownError'),
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
      toast({ title: t('settings.llm.saved') })
    } catch (err) {
      toast({
        title: t('settings.llm.saveFailed'),
        description: err instanceof Error ? err.message : tCommon('unknownError'),
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
      toast({ title: t('settings.llm.cleared') })
    } catch (err) {
      toast({
        title: t('settings.llm.clearFailed'),
        description: err instanceof Error ? err.message : tCommon('unknownError'),
        variant: 'destructive',
      })
    } finally {
      setLlmSaving(false)
    }
  }

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.llm.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            {t('settings.llm.desc', { ollama: 'Ollama' })}
          </p>

          {isHttpsMixed && (
            <div className="rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-700 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              {t('settings.llm.mixedContent')}
            </div>
          )}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="llm-base-url">{t('settings.llm.baseUrl')}</Label>
              <Input
                id="llm-base-url"
                placeholder={t('settings.llm.baseUrlPlaceholder')}
                value={llmBaseUrl}
                onChange={(e) => { setLlmBaseUrl(e.target.value); setLlmDirty(true) }}
              />
              <p className="text-xs text-muted-foreground">
                {t('settings.llm.baseUrlHint', {
                  ollamaUrl: 'http://localhost:11434/v1',
                  openaiUrl: 'https://api.openai.com/v1',
                })}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="llm-model">{t('settings.llm.model')}</Label>
              <Input
                id="llm-model"
                placeholder={t('settings.llm.modelPlaceholder')}
                value={llmModel}
                onChange={(e) => { setLlmModel(e.target.value); setLlmDirty(true) }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="llm-api-key">
                {t('settings.llm.apiKey')}{' '}
                <span className="text-muted-foreground font-normal">{t('settings.llm.apiKeyOptional')}</span>
              </Label>
              <Input
                id="llm-api-key"
                type="password"
                placeholder={t('settings.llm.apiKeyPlaceholder')}
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
              {llmSaving ? t('settings.llm.saving') : t('settings.llm.save')}
            </Button>
            {llmConfig && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleClearLlm}
                disabled={llmSaving}
              >
                {t('settings.llm.clear')}
              </Button>
            )}
          </div>

          {llmConfig && !llmDirty && (
            <p className="text-xs text-green-600 dark:text-green-400">
              {t('settings.llm.configured')}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.analysis.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{t('settings.analysis.autoAnalyze')}</p>
              <p className="text-xs text-muted-foreground">
                {t('settings.analysis.autoAnalyzeDesc')}
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
