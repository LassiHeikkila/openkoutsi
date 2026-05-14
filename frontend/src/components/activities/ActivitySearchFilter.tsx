'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'

export interface ActivityFilters {
  q: string
  sport_type: string
  workout_category: string
  start: string
  end: string
  min_duration: string
  max_duration: string
  min_distance: string
  max_distance: string
  min_tss: string
  max_tss: string
  has_power: boolean | null
}

export const EMPTY_FILTERS: ActivityFilters = {
  q: '',
  sport_type: '',
  workout_category: '',
  start: '',
  end: '',
  min_duration: '',
  max_duration: '',
  min_distance: '',
  max_distance: '',
  min_tss: '',
  max_tss: '',
  has_power: null,
}

const SPORT_TYPES = ['Ride', 'Run', 'Swim', 'Walk', 'Hike', 'VirtualRide', 'VirtualRun', 'WeightTraining', 'Yoga', 'Workout']
const WORKOUT_CATEGORIES = ['recovery', 'endurance', 'tempo', 'threshold', 'vo2max', 'anaerobic', 'sprint', 'strength', 'yoga', 'cross_training']

function countActiveFilters(filters: ActivityFilters): number {
  let n = 0
  if (filters.sport_type) n++
  if (filters.workout_category) n++
  if (filters.start || filters.end) n++
  if (filters.min_duration || filters.max_duration) n++
  if (filters.min_distance || filters.max_distance) n++
  if (filters.min_tss || filters.max_tss) n++
  if (filters.has_power !== null) n++
  return n
}

interface Props {
  filters: ActivityFilters
  onChange: (filters: ActivityFilters) => void
}

export function ActivitySearchFilter({ filters, onChange }: Props) {
  const t = useTranslations('activities')
  const [open, setOpen] = useState(false)
  const [localQ, setLocalQ] = useState(filters.q)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync localQ if parent resets filters
  useEffect(() => {
    setLocalQ(filters.q)
  }, [filters.q])

  const handleSearch = useCallback(
    (value: string) => {
      setLocalQ(value)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onChange({ ...filters, q: value })
      }, 300)
    },
    [filters, onChange],
  )

  const set = useCallback(
    (key: keyof ActivityFilters, value: string | boolean | null) => {
      onChange({ ...filters, [key]: value })
    },
    [filters, onChange],
  )

  const clearAll = useCallback(() => {
    onChange(EMPTY_FILTERS)
  }, [onChange])

  const activeCount = countActiveFilters(filters)

  return (
    <div className="space-y-2">
      {/* Search bar row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={t('search.placeholder')}
            value={localQ}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {t('search.filters')}
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-xs leading-none">
              {activeCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Active filter pills */}
      {(activeCount > 0 || filters.q) && (
        <div className="flex flex-wrap gap-1">
          {filters.sport_type && (
            <FilterPill label={filters.sport_type} onRemove={() => set('sport_type', '')} />
          )}
          {filters.workout_category && (
            <FilterPill
              label={t(`detail.category.${filters.workout_category}`)}
              onRemove={() => set('workout_category', '')}
            />
          )}
          {(filters.start || filters.end) && (
            <FilterPill
              label={[filters.start, filters.end].filter(Boolean).join(' → ')}
              onRemove={() => onChange({ ...filters, start: '', end: '' })}
            />
          )}
          {(filters.min_duration || filters.max_duration) && (
            <FilterPill
              label={`${t('search.duration')}: ${filters.min_duration || '0'}–${filters.max_duration || '∞'} min`}
              onRemove={() => onChange({ ...filters, min_duration: '', max_duration: '' })}
            />
          )}
          {(filters.min_distance || filters.max_distance) && (
            <FilterPill
              label={`${t('search.distance')}: ${filters.min_distance || '0'}–${filters.max_distance || '∞'} km`}
              onRemove={() => onChange({ ...filters, min_distance: '', max_distance: '' })}
            />
          )}
          {(filters.min_tss || filters.max_tss) && (
            <FilterPill
              label={`TSS: ${filters.min_tss || '0'}–${filters.max_tss || '∞'}`}
              onRemove={() => onChange({ ...filters, min_tss: '', max_tss: '' })}
            />
          )}
          {filters.has_power !== null && (
            <FilterPill
              label={filters.has_power ? t('search.hasPowerYes') : t('search.hasPowerNo')}
              onRemove={() => set('has_power', null)}
            />
          )}
          {activeCount > 1 && (
            <button
              onClick={clearAll}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground ml-1"
            >
              {t('search.clearAll')}
            </button>
          )}
        </div>
      )}

      {/* Expandable filter panel */}
      {open && (
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Sport type */}
            <div className="space-y-1.5">
              <Label>{t('search.sportType')}</Label>
              <Select
                value={filters.sport_type || '_all'}
                onValueChange={(v) => set('sport_type', v === '_all' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">{t('search.all')}</SelectItem>
                  {SPORT_TYPES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Workout category */}
            <div className="space-y-1.5">
              <Label>{t('search.workoutCategory')}</Label>
              <Select
                value={filters.workout_category || '_all'}
                onValueChange={(v) => set('workout_category', v === '_all' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">{t('search.all')}</SelectItem>
                  {WORKOUT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{t(`detail.category.${c}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date range */}
            <div className="space-y-1.5">
              <Label>{t('search.dateFrom')}</Label>
              <Input
                type="date"
                value={filters.start}
                onChange={(e) => set('start', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('search.dateTo')}</Label>
              <Input
                type="date"
                value={filters.end}
                onChange={(e) => set('end', e.target.value)}
              />
            </div>

            {/* Duration */}
            <div className="space-y-1.5">
              <Label>{t('search.durationMin')} (min)</Label>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={filters.min_duration}
                onChange={(e) => set('min_duration', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('search.durationMax')} (min)</Label>
              <Input
                type="number"
                min={0}
                placeholder="∞"
                value={filters.max_duration}
                onChange={(e) => set('max_duration', e.target.value)}
              />
            </div>

            {/* Distance */}
            <div className="space-y-1.5">
              <Label>{t('search.distanceMin')} (km)</Label>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={filters.min_distance}
                onChange={(e) => set('min_distance', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('search.distanceMax')} (km)</Label>
              <Input
                type="number"
                min={0}
                placeholder="∞"
                value={filters.max_distance}
                onChange={(e) => set('max_distance', e.target.value)}
              />
            </div>

            {/* TSS */}
            <div className="space-y-1.5">
              <Label>{t('search.tssMin')}</Label>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={filters.min_tss}
                onChange={(e) => set('min_tss', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('search.tssMax')}</Label>
              <Input
                type="number"
                min={0}
                placeholder="∞"
                value={filters.max_tss}
                onChange={(e) => set('max_tss', e.target.value)}
              />
            </div>
          </div>

          {/* Has power */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="has-power"
              checked={filters.has_power === true}
              onCheckedChange={(checked) =>
                set('has_power', checked === true ? true : null)
              }
            />
            <Label htmlFor="has-power" className="cursor-pointer">
              {t('search.hasPowerOnly')}
            </Label>
          </div>

          {/* Clear all */}
          {activeCount > 0 && (
            <div className="pt-1">
              <Button variant="ghost" size="sm" onClick={clearAll}>
                {t('search.clearAll')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs">
      {label}
      <button onClick={onRemove} aria-label="Remove filter" className="hover:text-foreground text-muted-foreground">
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}
