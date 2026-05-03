'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import { apiFetch } from '@/lib/api'
import { CustomFunction, executeCustomFunction, getCustomFunctions } from '@/lib/customFunctions'
import type { AthleteProfile } from '@/lib/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  existing?: CustomFunction
  streams?: Record<string, number[]>
  athlete: AthleteProfile | null
  onSaved: (fn: CustomFunction) => void
}

const SCALAR_PLACEHOLDER = `// Available: streams (Record<string, number[]>), info ({duration_s, ftp, weight_kg})
// Return a number or string.
const power = streams.power || [];
return power.reduce((sum, p) => sum + p, 0) / 1000; // total kJ`

const STREAM_PLACEHOLDER = `// Available: streams (Record<string, number[]>), info ({duration_s, ftp, weight_kg})
// Return an array of numbers with the same length as the input stream.
const power = streams.power || [];
const window = 30;
const result = new Array(power.length).fill(NaN);
for (let i = window - 1; i < power.length; i++) {
  let sum = 0;
  for (let j = i - window + 1; j <= i; j++) sum += power[j] || 0;
  result[i] = sum / window;
}
return result;`

export function CustomFunctionDialog({ open, onOpenChange, existing, streams, athlete, onSaved }: Props) {
  const t = useTranslations('activities')

  const [name, setName] = useState(existing?.name ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [type, setType] = useState<'scalar' | 'stream'>(existing?.type ?? 'scalar')
  const [body, setBody] = useState(existing?.body ?? '')
  const [testResult, setTestResult] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(existing?.name ?? '')
      setDescription(existing?.description ?? '')
      setType(existing?.type ?? 'scalar')
      setBody(existing?.body ?? '')
      setTestResult(null)
    }
  }, [open, existing])

  function handleTest() {
    if (!streams || !body.trim()) return
    const fn: CustomFunction = {
      id: existing?.id ?? 'preview',
      name,
      description,
      type,
      body,
      createdAt: '',
    }
    const info = {
      duration_s: null,
      ftp: athlete?.ftp ?? null,
      weight_kg: athlete?.weight_kg ?? null,
    }
    const result = executeCustomFunction(fn, streams, info)
    if (result.error) {
      setTestResult(`Error: ${result.error}`)
    } else if (result.type === 'scalar') {
      setTestResult(`${result.value}`)
    } else {
      const arr = result.data ?? []
      setTestResult(`Array[${arr.length}]: [${arr.slice(0, 5).map((v) => (isNaN(v) ? 'NaN' : v)).join(', ')}${arr.length > 5 ? ', …' : ''}]`)
    }
  }

  async function handleSave() {
    if (!name.trim() || !body.trim()) return
    setSaving(true)
    try {
      const currentSettings = (athlete?.app_settings ?? {}) as Record<string, unknown>
      const existing_fns = getCustomFunctions(currentSettings)

      const fn: CustomFunction = {
        id: existing?.id ?? crypto.randomUUID(),
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        body: body.trim(),
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      }

      const updated = existing
        ? existing_fns.map((f) => (f.id === fn.id ? fn : f))
        : [...existing_fns, fn]

      await apiFetch('/api/athlete/', {
        method: 'PUT',
        body: JSON.stringify({
          app_settings: { ...currentSettings, custom_functions: updated },
        }),
      })

      toast({ title: t('detail.signals.saved') })
      onSaved(fn)
      onOpenChange(false)
    } catch (err) {
      toast({
        title: t('detail.signals.saved'),
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const placeholder = type === 'scalar' ? SCALAR_PLACEHOLDER : STREAM_PLACEHOLDER

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle>{existing ? t('detail.signals.editFunction') : t('detail.signals.addFunction')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="fn-name">Name</Label>
              <Input
                id="fn-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My function"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as 'scalar' | 'stream')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scalar">{t('detail.signals.functionType.scalar')}</SelectItem>
                  <SelectItem value="stream">{t('detail.signals.functionType.stream')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fn-desc">Description (optional)</Label>
            <Input
              id="fn-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this function do?"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fn-body">Function body</Label>
            <p className="text-xs text-muted-foreground">{t('detail.signals.sandboxWarning')}</p>
            <textarea
              id="fn-body"
              className="w-full h-48 p-3 rounded-md border border-input bg-background text-sm font-mono resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={placeholder}
              spellCheck={false}
            />
          </div>

          {streams && (
            <div className="flex items-start gap-3">
              <Button type="button" variant="outline" size="sm" onClick={handleTest} disabled={!body.trim()}>
                {t('detail.signals.test')}
              </Button>
              {testResult !== null && (
                <div className="flex-1">
                  <span className="text-xs text-muted-foreground">{t('detail.signals.testResult')}: </span>
                  <span className={`text-sm font-mono ${testResult.startsWith('Error') ? 'text-destructive' : ''}`}>
                    {testResult}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || !body.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
