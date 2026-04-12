'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/api'
import type { PaginatedActivities } from '@/lib/types'
import { ActivityCard } from '@/components/activities/ActivityCard'
import { UploadDropzone } from '@/components/activities/UploadDropzone'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 20

export default function ActivitiesPage() {
  const [page, setPage] = useState(1)
  const { data, mutate, isLoading } = useSWR<PaginatedActivities>(
    `/api/activities/?page=${page}&page_size=${PAGE_SIZE}`,
    fetcher,
  )

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Activities</h1>

      <UploadDropzone onUploaded={() => { mutate(); }} />

      <div className="space-y-2">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {data?.items.map((a) => (
          <ActivityCard key={a.id} activity={a} />
        ))}
        {data?.items.length === 0 && (
          <p className="text-sm text-muted-foreground">No activities yet. Upload a .fit file above.</p>
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
