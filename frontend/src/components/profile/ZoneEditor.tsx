import { Trash2, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Zone } from '@/lib/types'

interface Props {
  zones: Zone[]
  unit: string         // e.g. "bpm" or "W"
  onChange: (zones: Zone[]) => void
}

export function ZoneEditor({ zones, unit, onChange }: Props) {
  const t = useTranslations('app')

  function update(index: number, field: keyof Zone, raw: string) {
    const next = zones.map((z, i) => {
      if (i !== index) return z
      if (field === 'name') return { ...z, name: raw }
      const n = parseInt(raw, 10)
      return { ...z, [field]: isNaN(n) ? z[field] : n }
    })
    onChange(next)
  }

  function add() {
    const last = zones[zones.length - 1]
    onChange([
      ...zones,
      { name: `Z${zones.length + 1}`, low: last ? last.high : 0, high: last ? last.high + 50 : 100 },
    ])
  }

  function remove(index: number) {
    onChange(zones.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      {zones.length > 0 && (
        <div className="grid grid-cols-[1fr_80px_80px_32px] gap-2 text-xs text-muted-foreground px-1">
          <span>{t('profile.zoneEditor.name')}</span>
          <span>{t('profile.zoneEditor.low', { unit })}</span>
          <span>{t('profile.zoneEditor.high', { unit })}</span>
          <span />
        </div>
      )}

      {zones.map((zone, i) => (
        <div key={i} className="grid grid-cols-[1fr_80px_80px_32px] gap-2 items-center">
          <Input
            value={zone.name}
            onChange={(e) => update(i, 'name', e.target.value)}
            placeholder={`Z${i + 1}`}
            className="h-8 text-sm"
          />
          <Input
            type="number"
            value={zone.low}
            onChange={(e) => update(i, 'low', e.target.value)}
            className="h-8 text-sm"
          />
          <Input
            type="number"
            value={zone.high}
            onChange={(e) => update(i, 'high', e.target.value)}
            className="h-8 text-sm"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => remove(i)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" className="mt-1" onClick={add}>
        <Plus className="h-3.5 w-3.5 mr-1" />
        {t('profile.zoneEditor.addZone')}
      </Button>
    </div>
  )
}
