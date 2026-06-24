'use client'

import { useTranslations } from 'next-intl'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export const DAY_NUMBERS = [1, 2, 3, 4, 5, 6, 7]

export const DEFAULT_DAY_TYPES: Record<number, string> = {
  2: 'threshold',
  4: 'endurance',
  6: 'long',
  7: 'recovery',
}

export const WORKOUT_TYPE_KEYS = [
  'recovery', 'tempo', 'threshold', 'vo2max', 'endurance', 'long', 'strength', 'yoga', 'cross-training',
] as const

interface Props {
  selectedDays: Set<number>
  onToggleDay: (day: number) => void
  dayTypes: Record<number, string>
  onDayTypeChange: (day: number, value: string) => void
  periodization: string
  onPeriodizationChange: (value: string) => void
  intensityPref: string
  onIntensityChange: (value: string) => void
  /** When true, shows the AI free-text description field. */
  useLlm?: boolean
  longDescription?: string
  onLongDescriptionChange?: (value: string) => void
}

/**
 * Plan structure controls (training days, per-day workout type, periodization,
 * intensity, optional AI description). Shared by the create and regenerate dialogs.
 */
export function PlanStructureFields({
  selectedDays,
  onToggleDay,
  dayTypes,
  onDayTypeChange,
  periodization,
  onPeriodizationChange,
  intensityPref,
  onIntensityChange,
  useLlm = false,
  longDescription = '',
  onLongDescriptionChange,
}: Props) {
  const t = useTranslations('app')
  const dayNames = t.raw('plan.generate.dayNames') as string[]

  return (
    <div className="space-y-4">
      {/* Day picker */}
      <div className="space-y-2">
        <Label>{t('plan.generate.trainingDays')}</Label>
        <div className="grid grid-cols-7 gap-1">
          {DAY_NUMBERS.map((day, i) => (
            <button
              key={day}
              type="button"
              onClick={() => onToggleDay(day)}
              className={`rounded-md py-1.5 text-xs font-medium border transition-colors ${
                selectedDays.has(day)
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input text-muted-foreground hover:border-muted-foreground'
              }`}
            >
              {dayNames[i]}
            </button>
          ))}
        </div>
      </div>

      {/* Per-day workout type */}
      {DAY_NUMBERS.filter((d) => selectedDays.has(d)).length > 0 && (
        <div className="space-y-2">
          <Label>{t('plan.generate.workoutPerDay')}</Label>
          <div className="space-y-2">
            {DAY_NUMBERS.filter((d) => selectedDays.has(d)).map((day) => (
              <div key={day} className="flex items-center gap-2">
                <span className="w-8 text-xs text-muted-foreground shrink-0">
                  {dayNames[day - 1]}
                </span>
                <Select
                  value={dayTypes[day] ?? 'recovery'}
                  onValueChange={(v) => onDayTypeChange(day, v)}
                >
                  <SelectTrigger className="h-8 text-sm flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WORKOUT_TYPE_KEYS.map((key) => (
                      <SelectItem key={key} value={key}>
                        {t(`plan.generate.workoutTypes.${key}` as never)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Periodization & intensity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>{t('plan.generate.periodization')}</Label>
          <Select value={periodization} onValueChange={onPeriodizationChange}>
            <SelectTrigger className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="base_building">{t('plan.generate.periodizationOptions.base_building')}</SelectItem>
              <SelectItem value="race_prep">{t('plan.generate.periodizationOptions.race_prep')}</SelectItem>
              <SelectItem value="maintenance">{t('plan.generate.periodizationOptions.maintenance')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t('plan.generate.intensity')}</Label>
          <Select value={intensityPref} onValueChange={onIntensityChange}>
            <SelectTrigger className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">{t('plan.generate.intensityOptions.low')}</SelectItem>
              <SelectItem value="moderate">{t('plan.generate.intensityOptions.moderate')}</SelectItem>
              <SelectItem value="high">{t('plan.generate.intensityOptions.high')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* LLM description */}
      {useLlm && onLongDescriptionChange && (
        <div className="space-y-2">
          <Label htmlFor="llm-desc">{t('plan.generate.aiDescLabel')}</Label>
          <textarea
            id="llm-desc"
            value={longDescription}
            onChange={(e) => onLongDescriptionChange(e.target.value)}
            placeholder={t('plan.generate.aiDescPlaceholder')}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      )}
    </div>
  )
}
