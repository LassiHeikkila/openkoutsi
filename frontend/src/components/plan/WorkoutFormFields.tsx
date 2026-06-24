'use client'

import { useTranslations } from 'next-intl'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { WorkoutFormValues } from '@/lib/planUtils'
import { WORKOUT_TYPE_KEYS } from './PlanStructureFields'

interface Props {
  values: WorkoutFormValues
  onChange: (patch: Partial<WorkoutFormValues>) => void
}

/** Shared input fields for editing/adding a single planned workout. */
export function WorkoutFormFields({ values, onChange }: Props) {
  const t = useTranslations('app')
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs">{t('plan.editWorkout.type')}</Label>
        <Select value={values.workout_type} onValueChange={(v) => onChange({ workout_type: v })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rest" className="text-xs">{t('plan.rest')}</SelectItem>
            {WORKOUT_TYPE_KEYS.map((key) => (
              <SelectItem key={key} value={key} className="text-xs">
                {t(`plan.generate.workoutTypes.${key}` as never)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{t('plan.editWorkout.duration')}</Label>
          <Input
            type="number"
            min="0"
            className="h-8 text-xs"
            value={values.duration_min}
            onChange={(e) => onChange({ duration_min: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('plan.editWorkout.tss')}</Label>
          <Input
            type="number"
            min="0"
            className="h-8 text-xs"
            value={values.target_tss}
            onChange={(e) => onChange({ target_tss: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t('plan.editWorkout.description')}</Label>
        <Textarea
          className="text-xs resize-none"
          rows={2}
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>
    </div>
  )
}
