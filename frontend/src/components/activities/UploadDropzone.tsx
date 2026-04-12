'use client'

import { useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api'
import { toast } from '@/components/ui/use-toast'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  onUploaded?: () => void
}

export function UploadDropzone({ onUploaded }: Props) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith('.fit') && !file.name.endsWith('.FIT')) {
        toast({ title: 'Invalid file', description: 'Only .fit files are supported', variant: 'destructive' })
        return
      }
      setUploading(true)
      try {
        const form = new FormData()
        form.append('file', file)
        await apiFetch('/api/activities/upload', { method: 'POST', body: form })
        toast({ title: 'Uploaded', description: `${file.name} is being processed` })
        onUploaded?.()
      } catch (err) {
        toast({
          title: 'Upload failed',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        })
      } finally {
        setUploading(false)
      }
    },
    [onUploaded],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) uploadFile(file)
    },
    [uploadFile],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) uploadFile(file)
      e.target.value = ''
    },
    [uploadFile],
  )

  return (
    <label
      className={cn(
        'flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer transition-colors',
        dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
        uploading && 'opacity-60 pointer-events-none',
      )}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <Upload className="h-6 w-6 text-muted-foreground" />
      <span className="text-sm text-muted-foreground text-center">
        {uploading ? 'Uploading…' : 'Drop a .fit file here, or click to browse'}
      </span>
      <input type="file" accept=".fit" className="sr-only" onChange={handleChange} />
    </label>
  )
}
