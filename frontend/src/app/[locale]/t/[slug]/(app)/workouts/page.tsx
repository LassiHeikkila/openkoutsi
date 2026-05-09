'use client'

import { useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import useSWR from 'swr'
import { useTranslations } from 'next-intl'
import { Plus, Upload } from 'lucide-react'
import { fetcher, apiFetch } from '@/lib/api'
import type { WorkoutDefinition } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/use-toast'
import { WorkoutDefinitionCard } from '@/components/workouts/WorkoutDefinitionCard'

function ImportButton({ onImported }: { onImported: (id: string) => void }) {
  const t = useTranslations('workouts')
  const tCommon = useTranslations('common')
  const inputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!inputRef.current) return
    inputRef.current.value = ''
    if (!file) return

    setImporting(true)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const body = {
        name: parsed.name ?? file.name.replace(/\.json$/i, ''),
        description: parsed.description ?? null,
        sport_type: parsed.sport_type ?? 'Ride',
        steps: parsed.steps ?? [],
      }
      const created = await apiFetch<WorkoutDefinition>('/api/workouts/', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      onImported(created.id)
    } catch {
      toast({
        title: tCommon('error'),
        description: t('importError'),
        variant: 'destructive',
      })
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={importing}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-4 w-4 mr-1" />
        {t('importWorkout')}
      </Button>
    </>
  )
}

function NewWorkoutDialog({ onCreated }: { onCreated: (id: string) => void }) {
  const t = useTranslations('workouts')
  const tCommon = useTranslations('common')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sportType, setSportType] = useState('Ride')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const created = await apiFetch<WorkoutDefinition>('/api/workouts/', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), description: description || null, sport_type: sportType, steps: [] }),
      })
      setOpen(false)
      setName('')
      setDescription('')
      setSportType('Ride')
      onCreated(created.id)
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

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1" />
        {t('newWorkout')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('newWorkout')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="wname">{t('name')}</Label>
              <Input
                id="wname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namePlaceholder')}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wdesc">{t('description')}</Label>
              <Textarea
                id="wdesc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('descriptionPlaceholder')}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wsport">{t('sportType')}</Label>
              <Input
                id="wsport"
                value={sportType}
                onChange={(e) => setSportType(e.target.value)}
                placeholder="Ride"
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
                {tCommon('cancel')}
              </Button>
              <Button type="submit" disabled={saving || !name.trim()}>
                {saving ? tCommon('saving') : t('create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function WorkoutsPage() {
  const t = useTranslations('workouts')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const { slug, locale } = useParams<{ slug: string; locale: string }>()
  const { data: workouts, mutate } = useSWR<WorkoutDefinition[]>('/api/workouts/', fetcher)

  function handleCreated(id: string) {
    router.push(`/${locale}/t/${slug}/workouts/${id}`)
  }

  function handleEdit(id: string) {
    router.push(`/${locale}/t/${slug}/workouts/${id}`)
  }

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/api/workouts/${id}`, { method: 'DELETE' })
      await mutate()
      toast({ title: t('deleted') })
    } catch (err) {
      toast({
        title: tCommon('error'),
        description: err instanceof Error ? err.message : tCommon('unknownError'),
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t('library')}</h1>
        <div className="flex gap-2">
          <ImportButton onImported={handleCreated} />
          <NewWorkoutDialog onCreated={handleCreated} />
        </div>
      </div>

      {workouts?.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      )}

      <div className="space-y-3">
        {workouts?.map((w) => (
          <WorkoutDefinitionCard
            key={w.id}
            workout={w}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  )
}
