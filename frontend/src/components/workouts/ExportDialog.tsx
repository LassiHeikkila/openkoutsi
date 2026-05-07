'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import useSWR from 'swr'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { fetcher, apiDownload } from '@/lib/api'
import type { ExportFormat } from '@/lib/types'

interface Props {
  workoutId: string
  workoutName: string
}

export function ExportDialog({ workoutId, workoutName }: Props) {
  const t = useTranslations('workouts')
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: formats } = useSWR<ExportFormat[]>(
    open ? '/api/workouts/export/formats' : null,
    fetcher,
  )

  async function handleExport() {
    if (!selected) return
    const fmt = formats?.find((f) => f.key === selected)
    if (!fmt) return
    setLoading(true)
    setError(null)
    try {
      const safeName = workoutName.replace(/[^a-zA-Z0-9-_ ]/g, '_')
      await apiDownload(
        `/api/workouts/${workoutId}/export/${selected}`,
        `${safeName}.${fmt.file_extension}`,
      )
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('exportError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Download className="h-4 w-4" />
        <span className="ml-1 hidden sm:inline">{t('export')}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('exportWorkout')}</DialogTitle>
          </DialogHeader>
          {formats ? (
            <RadioGroup value={selected} onValueChange={setSelected} className="gap-3">
              {formats.map((fmt) => (
                <div key={fmt.key} className="flex items-center gap-2">
                  <RadioGroupItem value={fmt.key} id={fmt.key} />
                  <Label htmlFor={fmt.key}>{fmt.label}</Label>
                </div>
              ))}
            </RadioGroup>
          ) : (
            <p className="text-sm text-muted-foreground">{t('loadingFormats')}</p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t('cancel')}</Button>
            <Button disabled={!selected || loading} onClick={handleExport}>
              {loading ? t('exporting') : t('download')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
