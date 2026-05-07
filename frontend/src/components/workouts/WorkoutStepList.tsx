'use client'

import { useTranslations } from 'next-intl'
import { Plus, Repeat } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { WorkoutStep, RepeatBlock, WorkoutStepOrRepeat } from '@/lib/types'
import { StepEditor } from '@/components/workouts/StepEditor'
import { RepeatBlockEditor } from '@/components/workouts/RepeatBlockEditor'

interface Props {
  steps: WorkoutStepOrRepeat[]
  onChange: (steps: WorkoutStepOrRepeat[]) => void
}

function makeDefaultStep(): WorkoutStep {
  return {
    kind: 'step',
    step_type: 'active',
    duration: { type: 'time', seconds: 300 },
    target: null,
    notes: null,
  }
}

function makeDefaultRepeat(): RepeatBlock {
  return {
    kind: 'repeat',
    repeat_count: 4,
    steps: [
      { kind: 'step', step_type: 'active', duration: { type: 'time', seconds: 300 }, target: null, notes: null },
      { kind: 'step', step_type: 'recovery', duration: { type: 'time', seconds: 180 }, target: null, notes: null },
    ],
  }
}

function spliceArray<T>(arr: T[], index: number, replacement: T | null): T[] {
  const copy = [...arr]
  if (replacement === null) {
    copy.splice(index, 1)
  } else {
    copy.splice(index, 1, replacement)
  }
  return copy
}

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

export function WorkoutStepList({ steps, onChange }: Props) {
  const t = useTranslations('workouts')

  return (
    <div className="space-y-2">
      {steps.map((step, i) => {
        if (step.kind === 'repeat') {
          return (
            <RepeatBlockEditor
              key={i}
              block={step}
              index={i}
              total={steps.length}
              onChange={(updated) => onChange(spliceArray(steps, i, updated))}
              onDelete={() => onChange(spliceArray(steps, i, null))}
              onMoveUp={() => onChange(moveItem(steps, i, i - 1))}
              onMoveDown={() => onChange(moveItem(steps, i, i + 1))}
            />
          )
        }
        return (
          <StepEditor
            key={i}
            step={step}
            index={i}
            total={steps.length}
            onChange={(updated) => onChange(spliceArray(steps, i, updated))}
            onDelete={() => onChange(spliceArray(steps, i, null))}
            onMoveUp={() => onChange(moveItem(steps, i, i - 1))}
            onMoveDown={() => onChange(moveItem(steps, i, i + 1))}
          />
        )
      })}

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange([...steps, makeDefaultStep()])}
        >
          <Plus className="h-4 w-4 mr-1" />
          {t('addStep')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange([...steps, makeDefaultRepeat()])}
        >
          <Repeat className="h-4 w-4 mr-1" />
          {t('addRepeat')}
        </Button>
      </div>
    </div>
  )
}
