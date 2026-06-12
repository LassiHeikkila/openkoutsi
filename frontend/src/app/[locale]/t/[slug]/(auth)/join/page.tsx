'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Link } from '@/navigation'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function JoinPage() {
  const t = useTranslations('messages')
  const { slug } = useParams<{ slug: string }>()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await apiFetch(
        `/api/teams/${slug}/join-requests`,
        {
          method: 'POST',
          body: JSON.stringify({
            username,
            password,
            display_name: displayName || undefined,
            message: message || undefined,
          }),
        },
        false,
      )
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('join.failed'))
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">{t('join.successTitle')}</CardTitle>
          <CardDescription>{t('join.successDesc')}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Link
            href={`/t/${slug}/login`}
            className="text-sm underline underline-offset-4 hover:text-primary"
          >
            {t('join.backToLogin')}
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">{t('join.title')}</CardTitle>
        <CardDescription>{t('join.description')}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="username">{t('join.username')}</Label>
            <Input
              id="username"
              type="text"
              placeholder={t('join.usernamePlaceholder')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('join.password')}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">{t('join.passwordHint')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="displayName">{t('join.displayName')}</Label>
            <Input
              id="displayName"
              type="text"
              placeholder={t('join.displayNamePlaceholder')}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">{t('join.message')}</Label>
            <Textarea
              id="message"
              placeholder={t('join.messagePlaceholder')}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t('join.submitting') : t('join.submit')}
          </Button>
          <Link
            href={`/t/${slug}/login`}
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-primary"
          >
            {t('join.backToLogin')}
          </Link>
        </CardFooter>
      </form>
    </Card>
  )
}
