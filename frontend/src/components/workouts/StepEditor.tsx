'use client'

import { useTranslations } from 'next-intl'
import { ChevronUp, ChevronDown, ChevronDown as ExpandIcon, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { WorkoutStep, WorkoutTarget, TargetSpec, WorkoutDuration, StepType, TargetMetric } from '@/lib/types'

interface Props {
  step: WorkoutStep
  index: number
  total: number
  onChange: (step: WorkoutStep) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

const STEP_TYPES: StepType[] = ['warmup', 'active', 'recovery', 'cooldown', 'rest', 'other']
const TARGET_METRICS: TargetMetric[] = ['power', 'hr', 'cadence', 'pace']
const SPEC_TYPES = ['zone', 'pct_ftp', 'absolute', 'range'] as const

function DurationEditor({
  duration,
  onChange,
}: {
  duration: WorkoutDuration
  onChange: (d: WorkoutDuration) => void
}) {
  const t = useTranslations('workouts')
  return (
    <div className="flex items-center gap-2">
      <Select
        value={duration.type}
        onValueChange={(v) => {
          if (v === 'time') onChange({ type: 'time', seconds: 60 })
          else if (v === 'distance') onChange({ type: 'distance', meters: 1000 })
          else onChange({ type: 'open' })
        }}
      >
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="time">{t('durTime')}</SelectItem>
          <SelectItem value="distance">{t('durDistance')}</SelectItem>
          <SelectItem value="open">{t('durOpen')}</SelectItem>
        </SelectContent>
      </Select>
      {duration.type === 'time' && (
        <Input
          type="number"
          min={1}
          className="w-24"
          value={duration.seconds}
          onChange={(e) => onChange({ type: 'time', seconds: Number(e.target.value) || 1 })}
        />
      )}
      {duration.type === 'time' && <span className="text-sm text-muted-foreground">{t('seconds')}</span>}
      {duration.type === 'distance' && (
        <Input
          type="number"
          min={1}
          className="w-24"
          value={duration.meters}
          onChange={(e) => onChange({ type: 'distance', meters: Number(e.target.value) || 1 })}
        />
      )}
      {duration.type === 'distance' && <span className="text-sm text-muted-foreground">{t('metres')}</span>}
    </div>
  )
}

function SpecEditor({
  metric,
  spec,
  onChange,
}: {
  metric: TargetMetric
  spec: TargetSpec
  onChange: (s: TargetSpec) => void
}) {
  const t = useTranslations('workouts')
  const unit = metric === 'power' ? 'W' : metric === 'hr' ? 'bpm' : metric === 'cadence' ? 'rpm' : 'min/km'
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select
        value={spec.type}
        onValueChange={(v) => {
          if (v === 'zone') onChange({ type: 'zone', zone_number: 3 })
          else if (v === 'pct_ftp') onChange({ type: 'pct_ftp', pct: 85 })
          else if (v === 'absolute') onChange({ type: 'absolute', value: 200 })
          else onChange({ type: 'range', low: 180, high: 220 })
        }}
      >
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="zone">{t('specZone')}</SelectItem>
          {metric === 'power' && <SelectItem value="pct_ftp">{t('specPctFtp')}</SelectItem>}
          <SelectItem value="absolute">{t('specAbsolute')}</SelectItem>
          <SelectItem value="range">{t('specRange')}</SelectItem>
        </SelectContent>
      </Select>
      {spec.type === 'zone' && (
        <Input
          type="number"
          min={1}
          max={7}
          className="w-20"
          value={spec.zone_number}
          onChange={(e) => onChange({ type: 'zone', zone_number: Number(e.target.value) || 1 })}
        />
      )}
      {spec.type === 'pct_ftp' && (
        <>
          <Input
            type="number"
            min={1}
            className="w-20"
            value={spec.pct}
            onChange={(e) => onChange({ type: 'pct_ftp', pct: Number(e.target.value) || 1 })}
          />
          <span className="text-sm text-muted-foreground">% FTP</span>
        </>
      )}
      {spec.type === 'absolute' && (
        <>
          <Input
            type="number"
            min={1}
            className="w-20"
            value={spec.value}
            onChange={(e) => onChange({ type: 'absolute', value: Number(e.target.value) || 1 })}
          />
          <span className="text-sm text-muted-foreground">{unit}</span>
        </>
      )}
      {spec.type === 'range' && (
        <>
          <Input
            type="number"
            min={1}
            className="w-20"
            value={spec.low}
            onChange={(e) => onChange({ type: 'range', low: Number(e.target.value) || 1, high: spec.high })}
          />
          <span className="text-sm text-muted-foreground">–</span>
          <Input
            type="number"
            min={1}
            className="w-20"
            value={spec.high}
            onChange={(e) => onChange({ type: 'range', low: spec.low, high: Number(e.target.value) || 1 })}
          />
          <span className="text-sm text-muted-foreground">{unit}</span>
        </>
      )}
    </div>
  )
}

export function StepEditor({ step, index, total, onChange, onDelete, onMoveUp, onMoveDown }: Props) {
  const t = useTranslations('workouts')
  const [notesOpen, setNotesOpen] = useState(!!step.notes)

  function setField<K extends keyof WorkoutStep>(key: K, value: WorkoutStep[K]) {
    onChange({ ...step, [key]: value })
  }

  const target = step.target

  return (
    <div className="border rounded-md p-3 bg-background space-y-3">
      <div className="flex items-center gap-2">
        <Select
          value={step.step_type}
          onValueChange={(v) => setField('step_type', v as StepType)}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STEP_TYPES.map((s) => (
              <SelectItem key={s} value={s}>{t(`stepType.${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1">
          <DurationEditor
            duration={step.duration}
            onChange={(d) => setField('duration', d)}
          />
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <Button size="icon" variant="ghost" onClick={onMoveUp} disabled={index === 0}>
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onMoveDown} disabled={index === total - 1}>
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Label className="text-xs text-muted-foreground w-12">{t('target')}</Label>
        <Select
          value={target?.metric ?? 'none'}
          onValueChange={(v) => {
            if (v === 'none') {
              setField('target', null)
            } else {
              setField('target', {
                metric: v as TargetMetric,
                spec: { type: 'zone', zone_number: 3 },
              })
            }
          }}
        >
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t('targetNone')}</SelectItem>
            {TARGET_METRICS.map((m) => (
              <SelectItem key={m} value={m}>{t(`targetMetric.${m}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {target && (
          <SpecEditor
            metric={target.metric}
            spec={target.spec}
            onChange={(spec) => setField('target', { ...target, spec })}
          />
        )}
      </div>

      <div>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          onClick={() => setNotesOpen((o) => !o)}
        >
          <ExpandIcon className={`h-3 w-3 transition-transform ${notesOpen ? 'rotate-180' : ''}`} />
          {t('notes')}
        </button>
        {notesOpen && (
          <Input
            className="mt-1 text-sm"
            placeholder={t('notesPlaceholder')}
            value={step.notes ?? ''}
            onChange={(e) => setField('notes', e.target.value || null)}
          />
        )}
      </div>
    </div>
  )
}
