'use client'

import { useTranslations } from 'next-intl'
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { RepeatBlock, WorkoutStep, WorkoutStepOrRepeat } from '@/lib/types'
import { StepEditor } from '@/components/workouts/StepEditor'

interface Props {
  block: RepeatBlock
  index: number
  total: number
  onChange: (block: RepeatBlock) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
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

export function RepeatBlockEditor({ block, index, total, onChange, onDelete, onMoveUp, onMoveDown }: Props) {
  const t = useTranslations('workouts')
  const steps = block.steps as WorkoutStep[]

  function updateSteps(newSteps: WorkoutStep[]) {
    onChange({ ...block, steps: newSteps })
  }

  return (
    <div className="border-2 border-dashed border-primary/30 rounded-md p-3 bg-primary/5 space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Label className="text-sm font-medium">{t('repeat')}</Label>
        <Input
          type="number"
          min={2}
          className="w-20"
          value={block.repeat_count}
          onChange={(e) => onChange({ ...block, repeat_count: Math.max(2, Number(e.target.value) || 2) })}
        />
        <span className="text-sm text-muted-foreground">{t('times')}</span>

        <div className="flex items-center gap-1 ml-auto shrink-0">
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

      <div className="space-y-2 pl-2">
        {steps.map((step, i) => (
          <StepEditor
            key={i}
            step={step}
            index={i}
            total={steps.length}
            onChange={(updated) => updateSteps(spliceArray(steps, i, updated))}
            onDelete={() => updateSteps(spliceArray(steps, i, null))}
            onMoveUp={() => updateSteps(moveItem(steps, i, i - 1))}
            onMoveDown={() => updateSteps(moveItem(steps, i, i + 1))}
          />
        ))}
        <Button
          size="sm"
          variant="outline"
          onClick={() => updateSteps([...steps, makeDefaultStep()])}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-1" />
          {t('addStep')}
        </Button>
      </div>
    </div>
  )
}
