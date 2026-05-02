'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { apiFetch } from '@/lib/api'
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
}

async function fetchTeams(secret: string): Promise<SuperadminTeam[]> {
  return apiFetch<SuperadminTeam[]>('/api/superadmin/teams', {
    headers: { 'X-Superadmin-Secret': secret },
  }, false)
}

export default function SuperadminPage() {
  const t = useTranslations('superadmin')

  const [secret, setSecret] = useState('')
  const [authedSecret, setAuthedSecret] = useState('')
  const [teams, setTeams] = useState<SuperadminTeam[] | null>(null)
  const [authError, setAuthError] = useState('')
  const [unlocking, setUnlocking] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<SuperadminTeam | null>(null)
  const [actionError, setActionError] = useState('')

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault()
    setUnlocking(true)
    setAuthError('')
    try {
      const data = await fetchTeams(secret)
      setTeams(data)
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
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <h1 className="text-xl font-semibold">{t('title')}</h1>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      <div>
        <h2 className="mb-3 text-base font-medium">{t('teamsTitle')}</h2>
        {teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noTeams')}</p>
        ) : (
          <div className="rounded-md border">
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-x-4 border-b bg-muted/50 px-4 py-2 text-sm font-medium text-muted-foreground">
              <span>{t('columns.name')}</span>
              <span>{t('columns.slug')}</span>
              <span>{t('columns.status')}</span>
              <span>{t('columns.members')}</span>
              <span>{t('columns.created')}</span>
              <span>{t('columns.actions')}</span>
            </div>
            {teams.map((team) => (
              <div
                key={team.id}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] items-center gap-x-4 border-b px-4 py-3 last:border-b-0"
              >
                <span className="font-medium">{team.name}</span>
                <span className="font-mono text-sm text-muted-foreground">{team.slug}</span>
                <span>
                  <Badge variant={statusBadgeVariant(team.status)}>
                    {t(`status.${team.status as 'pending' | 'active' | 'rejected'}`)}
                  </Badge>
                </span>
                <span className="text-sm">{team.member_count}</span>
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
