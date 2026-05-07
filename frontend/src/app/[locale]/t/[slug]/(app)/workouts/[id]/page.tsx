'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import useSWR from 'swr'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Code2, LayoutList } from 'lucide-react'
import { fetcher, apiFetch } from '@/lib/api'
import type { WorkoutDefinition, WorkoutStepOrRepeat } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/use-toast'
import { WorkoutStepList } from '@/components/workouts/WorkoutStepList'
import { ExportDialog } from '@/components/workouts/ExportDialog'

function estimateDuration(steps: WorkoutStepOrRepeat[]): number {
  let total = 0
  for (const step of steps) {
    if (step.kind === 'repeat') {
      total += estimateDuration(step.steps) * step.repeat_count
    } else if (step.duration.type === 'time') {
      total += step.duration.seconds
    }
  }
  return total
}

function formatDurSeconds(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec > 0 ? sec + 's' : ''}`
  return `${sec}s`
}

export default function WorkoutEditorPage() {
  const t = useTranslations('workouts')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const { slug, locale, id } = useParams<{ slug: string; locale: string; id: string }>()

  const { data: workout, mutate } = useSWR<WorkoutDefinition>(`/api/workouts/${id}`, fetcher)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sportType, setSportType] = useState('Ride')
  const [steps, setSteps] = useState<WorkoutStepOrRepeat[]>([])
  const [rawMode, setRawMode] = useState<boolean>(false)
  const [rawJson, setRawJson] = useState('')
  const [rawError, setRawError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (workout) {
      setName(workout.name)
      setDescription(workout.description ?? '')
      setSportType(workout.sport_type)
      setSteps(workout.steps)
      setRawJson(JSON.stringify(workout.steps, null, 2))
      setDirty(false)
    }
  }, [workout])

  function handleStepsChange(newSteps: WorkoutStepOrRepeat[]) {
    setSteps(newSteps)
    setRawJson(JSON.stringify(newSteps, null, 2))
    setDirty(true)
  }

  function handleRawChange(text: string) {
    setRawJson(text)
    setRawError(null)
    setDirty(true)
  }

  function switchToGraphical() {
    try {
      const parsed = JSON.parse(rawJson)
      if (!Array.isArray(parsed)) throw new Error('Must be an array')
      setSteps(parsed)
      setRawError(null)
      setRawMode(false)
    } catch (e) {
      setRawError(e instanceof Error ? e.message : t('invalidJson'))
    }
  }

  async function handleSave() {
    if (rawMode) {
      try {
        const parsed = JSON.parse(rawJson)
        if (!Array.isArray(parsed)) throw new Error('Must be an array')
        setSteps(parsed)
        setRawError(null)
      } catch (e) {
        setRawError(e instanceof Error ? e.message : t('invalidJson'))
        return
      }
    }
    setSaving(true)
    try {
      const stepsToSave = rawMode ? JSON.parse(rawJson) : steps
      await apiFetch(`/api/workouts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(),
          description: description || null,
          sport_type: sportType,
          steps: stepsToSave,
        }),
      })
      await mutate()
      setDirty(false)
      toast({ title: tCommon('saved') })
    } catch (err) {
      toast({
        title: tCommon('error'),
        description: err instanceof Error ? err.message : tCommon('unknownError'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const estDuration = estimateDuration(steps)

  if (!workout) {
    return <p className="text-sm text-muted-foreground">{tCommon('loading')}</p>
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/${locale}/t/${slug}/workouts`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold flex-1 truncate">{name || t('untitled')}</h1>
        <ExportDialog workoutId={id} workoutName={name || t('untitled')} />
        <Button onClick={handleSave} disabled={saving || !dirty}>
          {saving ? tCommon('saving') : tCommon('save')}
        </Button>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="wname">{t('name')}</Label>
          <Input
            id="wname"
            value={name}
            onChange={(e) => { setName(e.target.value); setDirty(true) }}
            placeholder={t('namePlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wdesc">{t('description')}</Label>
          <Textarea
            id="wdesc"
            value={description}
            onChange={(e) => { setDescription(e.target.value); setDirty(true) }}
            placeholder={t('descriptionPlaceholder')}
            rows={2}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wsport">{t('sportType')}</Label>
          <Input
            id="wsport"
            value={sportType}
            onChange={(e) => { setSportType(e.target.value); setDirty(true) }}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t('steps')}</h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (rawMode) switchToGraphical()
              else { setRawJson(JSON.stringify(steps, null, 2)); setRawMode(true) }
            }}
          >
            {rawMode ? (
              <><LayoutList className="h-4 w-4 mr-1" />{t('graphicalView')}</>
            ) : (
              <><Code2 className="h-4 w-4 mr-1" />{t('rawJson')}</>
            )}
          </Button>
        </div>

        {rawMode ? (
          <div className="space-y-2">
            <Textarea
              className="font-mono text-xs min-h-64"
              value={rawJson}
              onChange={(e) => handleRawChange(e.target.value)}
              spellCheck={false}
            />
            {rawError && <p className="text-sm text-destructive">{rawError}</p>}
          </div>
        ) : (
          <WorkoutStepList steps={steps} onChange={handleStepsChange} />
        )}

        {estDuration > 0 && (
          <p className="text-sm text-muted-foreground">
            {t('estimatedDuration')}: <span className="font-medium">{formatDurSeconds(estDuration)}</span>
          </p>
        )}
      </div>
    </div>
  )
}
