'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useTranslations } from 'next-intl'
import { fetcher } from '@/lib/api'
import type { PaginatedActivities } from '@/lib/types'
import { ActivityCard } from '@/components/activities/ActivityCard'
import { UploadDropzone } from '@/components/activities/UploadDropzone'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 20

export default function ActivitiesPage() {
  const t = useTranslations('activities')
  const [page, setPage] = useState(1)
  const [wahooDeviceOnly] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('wahoo_device_only') === '1'
    }
    return false
  })
  const apiUrl = `/api/activities/?page=${page}&page_size=${PAGE_SIZE}${wahooDeviceOnly ? '&wahoo_device_only=1' : ''}`
  const { data, mutate, isLoading } = useSWR<PaginatedActivities>(apiUrl, fetcher)

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      <UploadDropzone onUploaded={() => { mutate(); }} />

      <div className="space-y-2">
        {isLoading && (
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        )}
        {data?.items.map((a) => (
          <ActivityCard key={a.id} activity={a} />
        ))}
        {data?.items.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('noActivities')}</p>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="icon"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
