'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import useSWR from 'swr'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiFetch, fetcher, getTeamSlug } from '@/lib/api'

interface Props {
  workoutId: string
}

// Wahoo only shows plans scheduled today → +6 days.
const WAHOO_WINDOW_DAYS = 6

function isoDate(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

export function PushToWahooDialog({ workoutId }: Props) {
  const t = useTranslations('workouts')
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(isoDate(0))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Only show the action when Wahoo is connected.
  const { data: status } = useSWR<{ connected: string[] }>(
    '/api/integrations/status',
    fetcher,
  )
  const connected = status?.connected?.includes('wahoo') ?? false
  if (!connected) return null

  async function handlePush() {
    setLoading(true)
    setError(null)
    setSuccess(false)
    try {
      await apiFetch(`/api/workouts/${workoutId}/push/wahoo`, {
        method: 'POST',
        body: JSON.stringify({ starts: `${date}T12:00:00Z` }),
      })
      setSuccess(true)
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('pushError')
      setError(msg === 'insufficient_scope' ? t('reconnectWahoo') : msg)
    } finally {
      setLoading(false)
    }
  }

  const slug = getTeamSlug()
  const profileHref = slug ? `/t/${slug}/profile` : '/'

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Send className="h-4 w-4" />
        <span className="ml-1 hidden sm:inline">{t('sendToWahoo')}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('sendToWahoo')}</DialogTitle>
          </DialogHeader>
          {success ? (
            <p className="text-sm text-green-600">{t('pushSuccess')}</p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="wahoo-date">{t('pushDate')}</Label>
              <Input
                id="wahoo-date"
                type="date"
                value={date}
                min={isoDate(0)}
                max={isoDate(WAHOO_WINDOW_DAYS)}
                onChange={(e) => setDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('pushWindowHint')}</p>
            </div>
          )}
          {error && (
            <p className="text-sm text-destructive">
              {error}{' '}
              {error === t('reconnectWahoo') && (
                <a href={profileHref} className="underline">
                  {t('goToProfile')}
                </a>
              )}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {success ? t('close') : t('cancel')}
            </Button>
            {!success && (
              <Button disabled={loading} onClick={handlePush}>
                {loading ? t('pushing') : t('sendToWahoo')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
