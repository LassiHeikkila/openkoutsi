'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'

const CATEGORY_COLORS: Record<string, string> = {
  recovery: 'bg-blue-50 text-blue-700 hover:bg-blue-100',
  endurance: 'bg-sky-50 text-sky-700 hover:bg-sky-100',
  tempo: 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100',
  threshold: 'bg-orange-50 text-orange-700 hover:bg-orange-100',
  vo2max: 'bg-red-50 text-red-700 hover:bg-red-100',
  anaerobic: 'bg-rose-50 text-rose-700 hover:bg-rose-100',
  sprint: 'bg-purple-50 text-purple-700 hover:bg-purple-100',
  strength: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  yoga: 'bg-pink-50 text-pink-700 hover:bg-pink-100',
  cross_training: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
}

const ALL_CATEGORIES = [
  'recovery', 'endurance', 'tempo', 'threshold', 'vo2max',
  'anaerobic', 'sprint', 'strength', 'yoga', 'cross_training',
] as const

interface Props {
  category: string | null
  editable?: boolean
  onCategoryChange?: (category: string | null) => void
}

export function WorkoutCategoryBadge({ category, editable = false, onCategoryChange }: Props) {
  const t = useTranslations('activities')

  const colorClass = category ? (CATEGORY_COLORS[category] ?? 'bg-muted text-muted-foreground') : ''
  const label = category
    ? (t(`detail.category.${category}` as never) ?? category)
    : null

  if (!editable) {
    if (!label) return null
    return (
      <Badge className={`text-xs border-0 ${colorClass}`}>
        {label}
      </Badge>
    )
  }

  return (
    <Select
      value={category ?? '__none__'}
      onValueChange={(val) => onCategoryChange?.(val === '__none__' ? null : val)}
    >
      <SelectTrigger className="w-auto h-auto p-0 border-0 shadow-none focus:ring-0 bg-transparent">
        {label ? (
          <Badge className={`text-xs border-0 cursor-pointer ${colorClass}`}>
            {label}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground underline cursor-pointer">
            {t('detail.category.label')}
          </span>
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">{t('detail.category.none')}</SelectItem>
        {ALL_CATEGORIES.map((cat) => (
          <SelectItem key={cat} value={cat}>
            {t(`detail.category.${cat}` as never)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
