'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Trash2 } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { messageTypeKey, messageValues } from '@/lib/messages'
import type { Message } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'

interface SuperadminTeam {
  id: string
  slug: string
  name: string
  status: string
  created_at: string
  member_count: number
  consented_count: number
}

interface SuperadminUserTeam {
  team_id: string
  team_slug: string
  team_name: string
  roles: string[]
  joined_at: string
  consented_at: string | null
  consent_version: string | null
}

interface SuperadminUser {
  id: string
  username: string
  created_at: string
  teams: SuperadminUserTeam[]
}

async function fetchTeams(secret: string): Promise<SuperadminTeam[]> {
  return apiFetch<SuperadminTeam[]>('/api/superadmin/teams', {
    headers: { 'X-Superadmin-Secret': secret },
  }, false)
}

async function fetchUsers(secret: string): Promise<SuperadminUser[]> {
  return apiFetch<SuperadminUser[]>('/api/superadmin/users', {
    headers: { 'X-Superadmin-Secret': secret },
  }, false)
}

async function fetchMessages(secret: string): Promise<Message[]> {
  return apiFetch<Message[]>('/api/superadmin/messages', {
    headers: { 'X-Superadmin-Secret': secret },
  }, false)
}

export default function SuperadminPage() {
  const t = useTranslations('superadmin')
  const tm = useTranslations('messages')

  const [secret, setSecret] = useState('')
  const [authedSecret, setAuthedSecret] = useState('')
  const [teams, setTeams] = useState<SuperadminTeam[] | null>(null)
  const [users, setUsers] = useState<SuperadminUser[] | null>(null)
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [authError, setAuthError] = useState('')
  const [unlocking, setUnlocking] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<SuperadminTeam | null>(null)
  const [actionError, setActionError] = useState('')

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault()
    setUnlocking(true)
    setAuthError('')
    try {
      const [teamsData, usersData, messagesData] = await Promise.all([
        fetchTeams(secret),
        fetchUsers(secret),
        fetchMessages(secret),
      ])
      setTeams(teamsData)
      setUsers(usersData)
      setMessages(messagesData)
      setAuthedSecret(secret)
    } catch {
      setAuthError(t('authFailed'))
    } finally {
      setUnlocking(false)
    }
  }

  async function handleApprove(team: SuperadminTeam) {
    setActionError('')
    try {
      const updated = await apiFetch<SuperadminTeam>(
        `/api/superadmin/teams/${team.id}/approve`,
        { method: 'POST', headers: { 'X-Superadmin-Secret': authedSecret } },
        false,
      )
      setTeams((prev) => prev?.map((t) => (t.id === updated.id ? updated : t)) ?? null)
    } catch {
      setActionError(t('approveFailed'))
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setActionError('')
    try {
      await apiFetch(
        `/api/superadmin/teams/${deleteTarget.id}`,
        { method: 'DELETE', headers: { 'X-Superadmin-Secret': authedSecret } },
        false,
      )
      setTeams((prev) => prev?.filter((t) => t.id !== deleteTarget.id) ?? null)
    } catch {
      setActionError(t('deleteFailed'))
    } finally {
      setDeleteTarget(null)
    }
  }

  async function markMessageRead(id: string) {
    try {
      await apiFetch(
        `/api/superadmin/messages/${id}/read`,
        { method: 'POST', headers: { 'X-Superadmin-Secret': authedSecret } },
        false,
      )
      setMessages((prev) =>
        prev?.map((m) => (m.id === id ? { ...m, read_at: new Date().toISOString() } : m)) ?? null,
      )
    } catch {
      // best-effort
    }
  }

  async function deleteMessage(id: string) {
    try {
      await apiFetch(
        `/api/superadmin/messages/${id}`,
        { method: 'DELETE', headers: { 'X-Superadmin-Secret': authedSecret } },
        false,
      )
      setMessages((prev) => prev?.filter((m) => m.id !== id) ?? null)
    } catch {
      // best-effort
    }
  }

  function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' {
    if (status === 'active') return 'default'
    if (status === 'rejected') return 'destructive'
    return 'secondary'
  }

  if (!teams) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-4 p-8">
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <form onSubmit={handleUnlock} className="space-y-3">
            <div className="space-y-1">
              <Label>{t('secretLabel')}</Label>
              <Input
                type="password"
                placeholder={t('secretPlaceholder')}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                required
              />
            </div>
            {authError && <p className="text-sm text-destructive">{authError}</p>}
            <Button type="submit" className="w-full" disabled={unlocking || !secret}>
              {t('unlock')}
            </Button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-8">
      <h1 className="text-xl font-semibold">{t('title')}</h1>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {/* Teams */}
      <div>
        <h2 className="mb-3 text-base font-medium">{t('teamsTitle')}</h2>
        {teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noTeams')}</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-x-4 border-b bg-muted/50 px-4 py-2 text-sm font-medium text-muted-foreground">
                <span>{t('columns.name')}</span>
                <span>{t('columns.slug')}</span>
                <span>{t('columns.status')}</span>
                <span>{t('columns.members')}</span>
                <span>{t('columns.consent')}</span>
                <span>{t('columns.created')}</span>
                <span>{t('columns.actions')}</span>
              </div>
              {teams.map((team) => (
                <div
                  key={team.id}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] items-center gap-x-4 border-b px-4 py-3 last:border-b-0"
                >
                  <span className="font-medium">{team.name}</span>
                  <span className="font-mono text-sm text-muted-foreground">{team.slug}</span>
                  <span>
                    <Badge variant={statusBadgeVariant(team.status)}>
                      {t(`status.${team.status as 'pending' | 'active' | 'rejected'}`)}
                    </Badge>
                  </span>
                  <span className="text-sm">{team.member_count}</span>
                  <span className="text-sm">
                    {team.consented_count}/{team.member_count}
                    {team.consented_count < team.member_count && (
                      <span className="ml-1 text-destructive/70">
                        ({team.member_count - team.consented_count} {t('columns.consentPending')})
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(team.created_at).toLocaleDateString()}
                  </span>
                  <div className="flex gap-2">
                    {team.status !== 'active' && (
                      <Button size="sm" onClick={() => handleApprove(team)}>
                        {t('approve')}
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(team)}>
                      {t('delete')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Messages */}
      <div>
        <h2 className="mb-3 text-base font-medium">{t('messagesTitle')}</h2>
        {!messages || messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noMessages')}</p>
        ) : (
          <div className="space-y-2">
            {messages.map((m) => {
              const key = messageTypeKey(m.type)
              const values = messageValues(m.data)
              const interactive = !m.read_at
              return (
                <div
                  key={m.id}
                  className={`flex items-start justify-between gap-3 rounded-md border px-4 py-3 ${interactive ? 'cursor-pointer' : 'opacity-70'}`}
                  role={interactive ? 'button' : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  onClick={() => interactive && markMessageRead(m.id)}
                  onKeyDown={
                    interactive
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            markMessageRead(m.id)
                          }
                        }
                      : undefined
                  }
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {!m.read_at && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      )}
                      <p className="text-sm font-medium">{tm(`types.${key}.title` as never, values)}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">{tm(`types.${key}.body` as never, values)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={tm('inbox.delete')}
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteMessage(m.id)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Users */}
      <div>
        <h2 className="mb-3 text-base font-medium">{t('usersTitle')}</h2>
        {!users || users.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noUsers')}</p>
        ) : (
          <div className="rounded-md border divide-y">
            {users.map((user) => (
              <div key={user.id} className="px-4 py-3 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-medium">{user.username}</span>
                  <span className="text-xs text-muted-foreground">
                    {t('users.registered')} {new Date(user.created_at).toLocaleDateString()}
                  </span>
                </div>
                {user.teams.length === 0 ? (
                  <p className="text-xs text-muted-foreground pl-1">{t('users.noTeams')}</p>
                ) : (
                  <div className="space-y-2 pl-1">
                    {user.teams.map((membership) => (
                      <div key={membership.team_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="font-mono text-muted-foreground w-32 shrink-0 truncate">
                          {membership.team_slug}
                        </span>
                        <span className="text-muted-foreground">{membership.team_name}</span>
                        <div className="flex gap-1">
                          {membership.roles.map((r) => (
                            <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>
                          ))}
                        </div>
                        <span className="sm:ml-auto">
                          {membership.consented_at ? (
                            <span className="text-xs text-muted-foreground">
                              {t('users.consentAccepted')} {new Date(membership.consented_at).toLocaleDateString()}
                              {membership.consent_version && (
                                <span className="ml-1 opacity-60">v{membership.consent_version}</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-xs text-destructive/70">{t('users.noConsent')}</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteConfirmDesc', { name: deleteTarget?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('columns.actions')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('deleteConfirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
