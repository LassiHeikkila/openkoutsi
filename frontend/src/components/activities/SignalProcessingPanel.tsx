'use client'

import { useState, useMemo, useCallback } from 'react'
import { Plus, Trash2, BarChart2, EyeOff } from 'lucide-react'
import { useTranslations } from 'next-intl'
import useSWR from 'swr'
import { fetcher, apiFetch } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from '@/components/ui/use-toast'
import { totalEnergyKj, normalizedPower, rollingAverage } from '@/lib/streamAnalytics'
import {
  CustomFunction,
  executeCustomFunction,
  getCustomFunctions,
} from '@/lib/customFunctions'
import { CustomFunctionDialog } from '@/components/activities/CustomFunctionDialog'
import { OverlayStream } from '@/components/charts/CombinedStreamChart'
import type { AthleteProfile } from '@/lib/types'

const OVERLAY_COLORS = ['#06b6d4', '#ec4899', '#84cc16', '#f97316', '#8b5cf6']

interface Props {
  streams: Record<string, number[]>
  activityId: string
  athlete: AthleteProfile | null
  overlayStreams: OverlayStream[]
  onOverlayStreamsChange: (streams: OverlayStream[]) => void
}

export function SignalProcessingPanel({
  streams,
  activityId,
  athlete,
  overlayStreams,
  onOverlayStreamsChange,
}: Props) {
  const t = useTranslations('activities')
  const { data: freshAthlete, mutate: mutateAthlete } = useSWR<AthleteProfile>('/api/athlete/', fetcher)
  const effectiveAthlete = freshAthlete ?? athlete

  const [rollingWindow, setRollingWindow] = useState(30)
  const [showRolling, setShowRolling] = useState(false)
  const [fnDialogOpen, setFnDialogOpen] = useState(false)
  const [editingFn, setEditingFn] = useState<CustomFunction | undefined>()

  const energy = useMemo(() => totalEnergyKj(streams), [streams])
  const np = useMemo(() => normalizedPower(streams), [streams])

  const customFunctions = getCustomFunctions(effectiveAthlete?.app_settings)

  const info = {
    duration_s: null as number | null,
    ftp: effectiveAthlete?.ftp ?? null,
    weight_kg: effectiveAthlete?.weight_kg ?? null,
  }

  // Execute all custom functions against current streams
  const fnResults = useMemo(() => {
    return customFunctions.map((fn) => ({
      fn,
      result: executeCustomFunction(fn, streams, info),
    }))
  }, [customFunctions, streams, effectiveAthlete?.ftp, effectiveAthlete?.weight_kg])

  // Sync rolling average overlay
  const rollingKey = `rolling_avg_${rollingWindow}s`
  function handleRollingToggle(checked: boolean) {
    setShowRolling(checked)
    if (checked) {
      const powerData = streams['power']
      if (!powerData) return
      const smoothed = rollingAverage(powerData, rollingWindow)
      const colorIdx = overlayStreams.length % OVERLAY_COLORS.length
      onOverlayStreamsChange([
        ...overlayStreams.filter((o) => !o.key.startsWith('rolling_avg_')),
        {
          key: rollingKey,
          label: `${t('detail.chart.rollingAvg')} ${rollingWindow}s`,
          data: smoothed,
          color: OVERLAY_COLORS[colorIdx],
          yAxisId: 'power',
        },
      ])
    } else {
      onOverlayStreamsChange(overlayStreams.filter((o) => !o.key.startsWith('rolling_avg_')))
    }
  }

  function handleRollingWindowChange(val: number) {
    setRollingWindow(val)
    if (showRolling) {
      const powerData = streams['power']
      if (!powerData) return
      const smoothed = rollingAverage(powerData, val)
      onOverlayStreamsChange([
        ...overlayStreams.filter((o) => !o.key.startsWith('rolling_avg_')),
        {
          key: `rolling_avg_${val}s`,
          label: `${t('detail.chart.rollingAvg')} ${val}s`,
          data: smoothed,
          color: OVERLAY_COLORS[0],
          yAxisId: 'power',
        },
      ])
    }
  }

  function toggleStreamOverlay(fn: CustomFunction, data: number[], colorIdx: number) {
    const key = `custom_${fn.id}`
    if (overlayStreams.some((o) => o.key === key)) {
      onOverlayStreamsChange(overlayStreams.filter((o) => o.key !== key))
    } else {
      onOverlayStreamsChange([
        ...overlayStreams,
        {
          key,
          label: fn.name,
          data,
          color: OVERLAY_COLORS[colorIdx % OVERLAY_COLORS.length],
          yAxisId: 'power',
        },
      ])
    }
  }

  async function handleDeleteFn(fn: CustomFunction) {
    try {
      const currentSettings = (effectiveAthlete?.app_settings ?? {}) as Record<string, unknown>
      const updated = getCustomFunctions(currentSettings).filter((f) => f.id !== fn.id)
      await apiFetch('/api/athlete/', {
        method: 'PUT',
        body: JSON.stringify({
          app_settings: { ...currentSettings, custom_functions: updated },
        }),
      })
      // Remove any overlay from this function
      onOverlayStreamsChange(overlayStreams.filter((o) => o.key !== `custom_${fn.id}`))
      toast({ title: t('detail.signals.deleted') })
      mutateAthlete()
    } catch {
      toast({ title: t('detail.signals.deleted'), variant: 'destructive' })
    }
  }

  function handleFnSaved() {
    mutateAthlete()
    setEditingFn(undefined)
  }

  const hasPower = Array.isArray(streams['power']) && streams['power'].length > 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">{t('detail.signals.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Built-in analytics */}
        {hasPower && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {energy !== null && (
                <div className="rounded-md border px-3 py-2">
                  <p className="text-xs text-muted-foreground">{t('detail.signals.totalEnergy')}</p>
                  <p className="font-semibold mt-0.5">{energy} kJ</p>
                </div>
              )}
              {np !== null && (
                <div className="rounded-md border px-3 py-2">
                  <p className="text-xs text-muted-foreground">{t('detail.signals.normalizedPower')}</p>
                  <p className="font-semibold mt-0.5">{np} W</p>
                </div>
              )}
            </div>

            {/* Rolling average overlay */}
            <div className="flex items-center gap-3">
              <Checkbox
                id="rolling-avg-toggle"
                checked={showRolling}
                onCheckedChange={(v) => handleRollingToggle(!!v)}
              />
              <Label htmlFor="rolling-avg-toggle" className="cursor-pointer text-sm">
                {t('detail.chart.rollingAvg')}
              </Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={1}
                  max={600}
                  value={rollingWindow}
                  onChange={(e) => handleRollingWindowChange(Number(e.target.value))}
                  className="w-20 h-7 text-sm"
                />
                <span className="text-sm text-muted-foreground">{t('detail.chart.rollingAvgWindow')}</span>
              </div>
            </div>
          </div>
        )}

        {/* Custom functions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{t('detail.signals.customFunctions')}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditingFn(undefined)
                setFnDialogOpen(true)
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t('detail.signals.addFunction')}
            </Button>
          </div>

          {customFunctions.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('detail.signals.noFunctions')}</p>
          )}

          <div className="space-y-2">
            {fnResults.map(({ fn, result }, idx) => {
              const isActive = overlayStreams.some((o) => o.key === `custom_${fn.id}`)
              return (
                <div
                  key={fn.id}
                  className="flex items-start justify-between rounded-md border px-3 py-2 gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{fn.name}</p>
                    {fn.description && (
                      <p className="text-xs text-muted-foreground">{fn.description}</p>
                    )}
                    {result.error ? (
                      <p className="text-xs text-destructive font-mono mt-1">{result.error}</p>
                    ) : result.type === 'scalar' && result.value !== null ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('detail.signals.testResult')}: <span className="font-mono">{result.value}</span>
                      </p>
                    ) : result.type === 'stream' && result.data ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        Array[{result.data.length}]
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {fn.type === 'stream' && result.data && !result.error && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title={isActive ? t('detail.signals.hideOverlay') : t('detail.signals.showOverlay')}
                        onClick={() => toggleStreamOverlay(fn, result.data!, idx)}
                      >
                        {isActive ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <BarChart2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title={t('detail.signals.editFunction')}
                      onClick={() => {
                        setEditingFn(fn)
                        setFnDialogOpen(true)
                      }}
                    >
                      <span className="text-xs">✏</span>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      title={t('detail.signals.deleteFunction')}
                      onClick={() => handleDeleteFn(fn)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>

      <CustomFunctionDialog
        open={fnDialogOpen}
        onOpenChange={setFnDialogOpen}
        existing={editingFn}
        streams={streams}
        athlete={effectiveAthlete}
        onSaved={handleFnSaved}
      />
    </Card>
  )
}
