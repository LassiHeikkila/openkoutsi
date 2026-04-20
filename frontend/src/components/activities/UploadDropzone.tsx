'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { apiFetch } from '@/lib/api'
import { toast } from '@/components/ui/use-toast'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  onUploaded?: () => void
}

export function UploadDropzone({ onUploaded }: Props) {
  const t = useTranslations('activities')
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const fitFiles = Array.from(files).filter(
        (f) => f.name.endsWith('.fit') || f.name.endsWith('.FIT'),
      )
      if (fitFiles.length === 0) {
        toast({ title: t('upload.invalidFile'), description: t('upload.invalidFileDesc'), variant: 'destructive' })
        return
      }
      if (fitFiles.length < Array.from(files).length) {
        toast({ title: t('upload.someSkipped'), description: t('upload.someSkippedDesc'), variant: 'destructive' })
      }
      setUploading(true)
      let succeeded = 0
      for (const file of fitFiles) {
        try {
          const form = new FormData()
          form.append('file', file)
          await apiFetch('/api/activities/upload', { method: 'POST', body: form })
          succeeded++
        } catch (err) {
          toast({
            title: t('upload.uploadFailed', { name: file.name }),
            description: err instanceof Error ? err.message : 'Unknown error',
            variant: 'destructive',
          })
        }
      }
      setUploading(false)
      if (succeeded > 0) {
        toast({
          title: succeeded === 1 ? t('upload.uploaded') : t('upload.uploadedMultiple', { count: succeeded }),
          description: succeeded === 1
            ? t('upload.processing', { name: fitFiles[0].name })
            : t('upload.processingMultiple'),
        })
        onUploaded?.()
      }
    },
    [onUploaded, t],
  )

  useEffect(() => {
    const el = dropRef.current
    if (!el) return

    let counter = 0

    const onDragEnter = (e: DragEvent) => {
      e.preventDefault()
      counter++
      setDragging(true)
    }
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault()
      counter--
      if (counter === 0) setDragging(false)
    }
    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
    }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      counter = 0
      setDragging(false)
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        uploadFiles(e.dataTransfer.files)
      }
    }

    el.addEventListener('dragenter', onDragEnter)
    el.addEventListener('dragleave', onDragLeave)
    el.addEventListener('dragover', onDragOver)
    el.addEventListener('drop', onDrop)

    return () => {
      el.removeEventListener('dragenter', onDragEnter)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('drop', onDrop)
    }
  }, [uploadFiles])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) uploadFiles(e.target.files)
      e.target.value = ''
    },
    [uploadFiles],
  )

  return (
    <div
      ref={dropRef}
      className={cn(
        'flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer transition-colors select-none',
        dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
        uploading && 'opacity-60 pointer-events-none',
      )}
      onClick={() => !uploading && inputRef.current?.click()}
    >
      <Upload className="h-6 w-6 text-muted-foreground" />
      <span className="text-sm text-muted-foreground text-center">
        {uploading ? t('upload.uploading') : t('upload.drop')}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept=".fit"
        multiple
        className="sr-only"
        onChange={handleChange}
      />
    </div>
  )
}
