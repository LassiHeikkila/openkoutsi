'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/navigation'
import useSWR, { mutate as globalMutate } from 'swr'
import { Trash2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { apiFetch, fetcher } from '@/lib/api'
import { messageTypeKey, messageValues } from '@/lib/messages'
import type { Message } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { toast } from '@/components/ui/use-toast'

const UNREAD_KEY = '/api/messages/unread-count'

export default function InboxPage() {
  const t = useTranslations('messages')
  const { isAdmin, loading } = useAuth()
  const router = useRouter()
  const { slug } = useParams<{ slug: string }>()
  const { data: messages, mutate } = useSWR<Message[]>('/api/messages', fetcher)

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace(`/t/${slug}/dashboard`)
    }
  }, [isAdmin, loading, router, slug])

  if (loading || !isAdmin) return null

  async function markRead(id: string) {
    try {
      await apiFetch(`/api/messages/${id}/read`, { method: 'POST' })
      mutate()
      globalMutate(UNREAD_KEY)
    } catch {
      // best-effort
    }
  }

  async function markAllRead() {
    try {
      await apiFetch('/api/messages/read-all', { method: 'POST' })
      mutate()
      globalMutate(UNREAD_KEY)
    } catch {
      // best-effort
    }
  }

  async function remove(id: string) {
    try {
      await apiFetch(`/api/messages/${id}`, { method: 'DELETE' })
      mutate()
      globalMutate(UNREAD_KEY)
    } catch (err) {
      toast({
        title: t('inbox.deleteFailed'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
  }

  if (!messages) return <p className="text-sm text-muted-foreground py-4">Loading…</p>

  const hasUnread = messages.some((m) => !m.read_at)

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('inbox.title')}</h1>
        {hasUnread && (
          <Button size="sm" variant="outline" onClick={markAllRead}>
            {t('inbox.markAllRead')}
          </Button>
        )}
      </div>

      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('inbox.empty')}</p>
      ) : (
        <div className="space-y-2">
          {messages.map((m) => {
            const key = messageTypeKey(m.type)
            const values = messageValues(m.data)
            const interactive = !m.read_at
            return (
              <Card
                key={m.id}
                className={`p-4 ${interactive ? 'cursor-pointer' : 'cursor-default opacity-70'}`}
                role={interactive ? 'button' : undefined}
                tabIndex={interactive ? 0 : undefined}
                onClick={() => interactive && markRead(m.id)}
                onKeyDown={
                  interactive
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          markRead(m.id)
                        }
                      }
                    : undefined
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {!m.read_at && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      )}
                      <p className="text-sm font-medium">
                        {t(`types.${key}.title` as never, values)}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t(`types.${key}.body` as never, values)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(m.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('inbox.delete')}
                    onClick={(e) => {
                      e.stopPropagation()
                      remove(m.id)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
