'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { useTranslations } from 'next-intl'
import { fetcher } from '@/lib/api'
import type { PaginatedActivities } from '@/lib/types'
import { ActivityCard } from '@/components/activities/ActivityCard'
import { UploadDropzone } from '@/components/activities/UploadDropzone'
import { ActivitySearchFilter, EMPTY_FILTERS } from '@/components/activities/ActivitySearchFilter'
import type { ActivityFilters } from '@/components/activities/ActivitySearchFilter'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 20

function filtersToParams(filters: ActivityFilters, page: number): URLSearchParams {
  const p = new URLSearchParams()
  p.set('page', String(page))
  p.set('page_size', String(PAGE_SIZE))
  if (filters.q) p.set('q', filters.q)
  if (filters.sport_type) p.set('sport_type', filters.sport_type)
  if (filters.workout_category) p.set('workout_category', filters.workout_category)
  if (filters.start) p.set('start', filters.start)
  if (filters.end) p.set('end', filters.end)
  if (filters.min_duration) p.set('min_duration', String(Math.round(Number(filters.min_duration) * 60)))
  if (filters.max_duration) p.set('max_duration', String(Math.round(Number(filters.max_duration) * 60)))
  if (filters.min_distance) p.set('min_distance', String(Number(filters.min_distance) * 1000))
  if (filters.max_distance) p.set('max_distance', String(Number(filters.max_distance) * 1000))
  if (filters.min_tss) p.set('min_tss', filters.min_tss)
  if (filters.max_tss) p.set('max_tss', filters.max_tss)
  if (filters.has_power !== null) p.set('has_power', filters.has_power ? 'true' : 'false')
  return p
}

function paramsToFilters(params: URLSearchParams): ActivityFilters {
  const minDurS = params.get('min_duration')
  const maxDurS = params.get('max_duration')
  const minDistM = params.get('min_distance')
  const maxDistM = params.get('max_distance')
  const hasPowerRaw = params.get('has_power')
  return {
    q: params.get('q') ?? '',
    sport_type: params.get('sport_type') ?? '',
    workout_category: params.get('workout_category') ?? '',
    start: params.get('start') ?? '',
    end: params.get('end') ?? '',
    min_duration: minDurS ? String(Math.round(Number(minDurS) / 60)) : '',
    max_duration: maxDurS ? String(Math.round(Number(maxDurS) / 60)) : '',
    min_distance: minDistM ? String(Number(minDistM) / 1000) : '',
    max_distance: maxDistM ? String(Number(maxDistM) / 1000) : '',
    min_tss: params.get('min_tss') ?? '',
    max_tss: params.get('max_tss') ?? '',
    has_power: hasPowerRaw === 'true' ? true : hasPowerRaw === 'false' ? false : null,
  }
}

export default function ActivitiesPage() {
  const t = useTranslations('activities')
  const router = useRouter()
  const searchParams = useSearchParams()

  const [filters, setFilters] = useState<ActivityFilters>(() => paramsToFilters(searchParams))
  const [page, setPage] = useState(() => Number(searchParams.get('page') ?? '1'))

  const apiParams = filtersToParams(filters, page)
  const apiUrl = `/api/activities/?${apiParams.toString()}`
  const { data, mutate, isLoading } = useSWR<PaginatedActivities>(apiUrl, fetcher)

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1

  const handleFiltersChange = useCallback((next: ActivityFilters) => {
    setFilters(next)
    setPage(1)
    const urlParams = filtersToParams(next, 1)
    router.replace(`?${urlParams.toString()}`, { scroll: false })
  }, [router])

  const handlePageChange = useCallback((next: number) => {
    setPage(next)
    const urlParams = filtersToParams(filters, next)
    router.replace(`?${urlParams.toString()}`, { scroll: false })
  }, [filters, router])

  // Keep state in sync when browser back/forward navigates
  useEffect(() => {
    setFilters(paramsToFilters(searchParams))
    setPage(Number(searchParams.get('page') ?? '1'))
  }, [searchParams])

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      <UploadDropzone onUploaded={() => { mutate() }} />

      <ActivitySearchFilter filters={filters} onChange={handleFiltersChange} />

      <div className="space-y-2">
        {isLoading && (
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        )}
        {data?.items.map((a) => (
          <ActivityCard key={a.id} activity={a} />
        ))}
        {!isLoading && data?.items.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('noActivities')}</p>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="icon"
            disabled={page === 1}
            onClick={() => handlePageChange(page - 1)}
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
            onClick={() => handlePageChange(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
