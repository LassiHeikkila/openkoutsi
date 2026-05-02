'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/navigation'
import useSWR, { mutate as globalMutate } from 'swr'
import { useAuth } from '@/lib/auth'
import { apiFetch, fetcher } from '@/lib/api'
import type { MemberResponse, InvitationResponse, TeamSettingsResponse } from '@/lib/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/use-toast'

const ALL_ROLES = ['administrator', 'coach', 'user'] as const

function RoleBadge({ role }: { role: string }) {
  const color =
    role === 'administrator'
      ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
      : role === 'coach'
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
        : 'bg-muted text-muted-foreground'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {role}
    </span>
  )
}

// ── Members tab ────────────────────────────────────────────────────────────────

function MembersTab({ slug }: { slug: string }) {
  const t = useTranslations('admin')
  const { data: members, mutate } = useSWR<MemberResponse[]>(
    `/api/teams/${slug}/members`,
    fetcher,
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftRoles, setDraftRoles] = useState<string[]>([])

  function startEdit(member: MemberResponse) {
    setEditingId(member.user_id)
    setDraftRoles([...member.roles])
  }

  function toggleRole(role: string) {
    setDraftRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    )
  }

  async function saveRoles(userId: string) {
    try {
      await apiFetch(`/api/teams/${slug}/members/${userId}/roles`, {
        method: 'PATCH',
        body: JSON.stringify({ roles: draftRoles }),
      })
      toast({ title: t('members.rolesUpdated') })
      setEditingId(null)
      mutate()
    } catch (err) {
      toast({
        title: t('members.updateFailed'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
  }

  async function removeMember(userId: string) {
    try {
      await apiFetch(`/api/teams/${slug}/members/${userId}`, { method: 'DELETE' })
      mutate()
    } catch (err) {
      toast({
        title: t('members.removeFailed'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
  }

  async function generatePasswordReset(userId: string) {
    try {
      const res = await apiFetch<{ reset_url: string }>(
        `/api/teams/${slug}/members/${userId}/password-reset`,
        { method: 'POST' },
      )
      await navigator.clipboard.writeText(res.reset_url)
      toast({ title: t('members.passwordResetDone') })
    } catch (err) {
      toast({
        title: t('members.passwordResetFailed'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
  }

  if (!members) return <p className="text-sm text-muted-foreground py-4">Loading…</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">{t('members.username')}</th>
            <th className="pb-2 pr-4 font-medium">{t('members.roles')}</th>
            <th className="pb-2 pr-4 font-medium">{t('members.joinedAt')}</th>
            <th className="pb-2 font-medium">{t('members.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.user_id} className="border-b last:border-0">
              <td className="py-3 pr-4 font-mono">{m.username}</td>
              <td className="py-3 pr-4">
                {editingId === m.user_id ? (
                  <div className="flex flex-wrap gap-1">
                    {ALL_ROLES.map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => toggleRole(role)}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium border transition-colors ${
                          draftRoles.includes(role)
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-muted text-muted-foreground hover:border-foreground'
                        }`}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {m.roles.map((r) => (
                      <RoleBadge key={r} role={r} />
                    ))}
                  </div>
                )}
              </td>
              <td className="py-3 pr-4 text-muted-foreground">
                {new Date(m.joined_at).toLocaleDateString()}
              </td>
              <td className="py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {editingId === m.user_id ? (
                    <>
                      <Button size="sm" onClick={() => saveRoles(m.user_id)}>
                        {t('members.saveRoles')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={() => startEdit(m)}>
                        {t('members.editRoles')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => generatePasswordReset(m.user_id)}
                      >
                        {t('members.passwordReset')}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive">
                            {t('members.remove')}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('members.removeConfirmTitle')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('members.removeConfirmDesc', { username: m.username })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => removeMember(m.user_id)}
                            >
                              {t('members.removeConfirmAction')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Invitations tab ────────────────────────────────────────────────────────────

function GenerateInviteDialog({ slug, onCreated }: { slug: string; onCreated: () => void }) {
  const t = useTranslations('admin')
  const [open, setOpen] = useState(false)
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['user'])
  const [expiryDays, setExpiryDays] = useState<string>('7')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function toggleRole(role: string) {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    )
  }

  async function handleGenerate() {
    setLoading(true)
    try {
      const body: { roles: string[]; expires_in_days?: number | null; note?: string } = {
        roles: selectedRoles,
        expires_in_days: expiryDays === 'never' ? null : parseInt(expiryDays),
        note: note.trim() || undefined,
      }
      const res = await apiFetch<InvitationResponse>(`/api/teams/${slug}/invitations`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setGeneratedUrl(res.url ?? null)
      onCreated()
    } catch (err) {
      toast({
        title: t('invitations.generateFailed'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!generatedUrl) return
    await navigator.clipboard.writeText(generatedUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function handleClose() {
    setOpen(false)
    setGeneratedUrl(null)
    setCopied(false)
    setSelectedRoles(['user'])
    setExpiryDays('7')
    setNote('')
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true) }}>
      <DialogTrigger asChild>
        <Button size="sm">{t('invitations.generate')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('invitations.generateTitle')}</DialogTitle>
        </DialogHeader>
        {generatedUrl ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('invitations.generatedUrl')}</p>
            <div className="flex gap-2">
              <Input value={generatedUrl} readOnly className="font-mono text-xs" />
              <Button size="sm" onClick={handleCopy}>
                {copied ? t('invitations.copied') : t('invitations.copyLink')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('invitations.generateRoles')}</Label>
              <div className="flex gap-2 flex-wrap">
                {ALL_ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggleRole(role)}
                    className={`rounded-full px-2 py-0.5 text-xs font-medium border transition-colors ${
                      selectedRoles.includes(role)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-muted text-muted-foreground hover:border-foreground'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('invitations.generateExpiry')}</Label>
              <div className="flex gap-2 flex-wrap">
                {[
                  { val: '1', label: t('invitations.expiry1') },
                  { val: '7', label: t('invitations.expiry7') },
                  { val: '30', label: t('invitations.expiry30') },
                  { val: 'never', label: t('invitations.expiryNever') },
                ].map(({ val, label }) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setExpiryDays(val)}
                    className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                      expiryDays === val
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-muted text-muted-foreground hover:border-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-note">{t('invitations.note')}</Label>
              <Input
                id="invite-note"
                placeholder={t('invitations.notePlaceholder')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={120}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          {generatedUrl ? (
            <Button onClick={handleClose}>Done</Button>
          ) : (
            <Button onClick={handleGenerate} disabled={loading || selectedRoles.length === 0}>
              {loading ? t('invitations.generating') : t('invitations.generateSubmit')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InvitationsTab({ slug }: { slug: string }) {
  const t = useTranslations('admin')
  const { data: invitations, mutate } = useSWR<InvitationResponse[]>(
    `/api/teams/${slug}/invitations`,
    fetcher,
  )
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const pending = invitations?.filter((i) => !i.used_at) ?? []
  const used = invitations?.filter((i) => i.used_at) ?? []

  async function copyLink(inv: InvitationResponse) {
    if (!inv.url) return
    await navigator.clipboard.writeText(inv.url)
    setCopiedId(inv.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  async function revokeInvitation(id: string) {
    try {
      await apiFetch(`/api/teams/${slug}/invitations/${id}`, { method: 'DELETE' })
      mutate()
    } catch (err) {
      toast({
        title: t('invitations.revokeFailed'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
  }

  if (!invitations) return <p className="text-sm text-muted-foreground py-4">Loading…</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('invitations.pending')}</h3>
        <GenerateInviteDialog slug={slug} onCreated={mutate} />
      </div>

      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('invitations.noPending')}</p>
      ) : (
        <div className="space-y-2">
          {pending.map((inv) => (
            <div
              key={inv.id}
              className="flex flex-wrap items-center gap-3 rounded-md border px-4 py-3 text-sm"
            >
              <div className="flex gap-1 flex-wrap">
                {inv.roles.map((r) => (
                  <RoleBadge key={r} role={r} />
                ))}
              </div>
              {inv.note && (
                <span className="font-medium">{inv.note}</span>
              )}
              <span className="text-muted-foreground">
                {t('invitations.createdBy')} {inv.created_by_username}
              </span>
              <span className="text-muted-foreground">
                {inv.expires_at
                  ? `${t('invitations.expires')} ${new Date(inv.expires_at).toLocaleDateString()}`
                  : t('invitations.noExpiry')}
              </span>
              <div className="ml-auto flex gap-2">
                {inv.url && (
                  <Button size="sm" variant="outline" onClick={() => copyLink(inv)}>
                    {copiedId === inv.id ? t('invitations.copied') : t('invitations.copyLink')}
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive">
                      {t('invitations.revoke')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('invitations.revokeConfirmTitle')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('invitations.revokeConfirmDesc')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => revokeInvitation(inv.id)}
                      >
                        {t('invitations.revokeConfirmAction')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 className="text-sm font-semibold">{t('invitations.used')}</h3>
      {used.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('invitations.noUsed')}</p>
      ) : (
        <div className="space-y-2">
          {used.map((inv) => (
            <div
              key={inv.id}
              className="flex flex-wrap items-center gap-3 rounded-md border px-4 py-3 text-sm text-muted-foreground"
            >
              <div className="flex gap-1 flex-wrap">
                {inv.roles.map((r) => (
                  <RoleBadge key={r} role={r} />
                ))}
              </div>
              {inv.note && (
                <span className="font-medium text-foreground">{inv.note}</span>
              )}
              <span>
                {t('invitations.usedBy')} {inv.used_by_username}
              </span>
              {inv.used_at && (
                <span>
                  {t('invitations.usedAt')} {new Date(inv.used_at).toLocaleDateString()}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Settings tab ───────────────────────────────────────────────────────────────

function SettingsTab({ slug }: { slug: string }) {
  const t = useTranslations('admin')
  const { data: settings, mutate } = useSWR<TeamSettingsResponse>(
    `/api/teams/${slug}/settings`,
    fetcher,
  )
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [clearKey, setClearKey] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (settings) {
      setBaseUrl(settings.llm_base_url ?? '')
      setModel(settings.llm_model ?? '')
    }
  }, [settings])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await apiFetch(`/api/teams/${slug}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          llm_base_url: baseUrl || null,
          llm_model: model || null,
          llm_api_key: apiKey || null,
          clear_llm_api_key: clearKey,
        }),
      })
      setApiKey('')
      setClearKey(false)
      mutate()
      toast({ title: t('settings.saved') })
    } catch (err) {
      toast({
        title: t('settings.saveFailed'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('settings.llmTitle')}</CardTitle>
        <CardDescription>{t('settings.llmDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4 max-w-md">
          <div className="space-y-2">
            <Label htmlFor="llm-base-url">{t('settings.baseUrl')}</Label>
            <Input
              id="llm-base-url"
              type="url"
              placeholder={t('settings.baseUrlPlaceholder')}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="llm-model">{t('settings.model')}</Label>
            <Input
              id="llm-model"
              type="text"
              placeholder={t('settings.modelPlaceholder')}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="llm-api-key">{t('settings.apiKey')}</Label>
            {settings?.llm_api_key_set && !clearKey && (
              <p className="text-xs text-muted-foreground">{t('settings.apiKeySet')}</p>
            )}
            <Input
              id="llm-api-key"
              type="password"
              placeholder={t('settings.apiKeyPlaceholder')}
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setClearKey(false) }}
              autoComplete="new-password"
            />
            {settings?.llm_api_key_set && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setClearKey(true); setApiKey('') }}
              >
                {t('settings.clearKey')}
              </Button>
            )}
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? t('settings.saving') : t('settings.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const t = useTranslations('admin')
  const { isAdmin, loading } = useAuth()
  const router = useRouter()
  const { slug } = useParams<{ slug: string }>()

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace(`/t/${slug}/dashboard`)
    }
  }, [isAdmin, loading, router, slug])

  if (loading || !isAdmin) return null

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">{t('tabs.members')}</TabsTrigger>
          <TabsTrigger value="invitations">{t('tabs.invitations')}</TabsTrigger>
          <TabsTrigger value="settings">{t('tabs.settings')}</TabsTrigger>
        </TabsList>
        <TabsContent value="members" className="mt-4">
          <MembersTab slug={slug} />
        </TabsContent>
        <TabsContent value="invitations" className="mt-4">
          <InvitationsTab slug={slug} />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <SettingsTab slug={slug} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
