'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/navigation'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export default function RegisterPage() {
  const t = useTranslations('auth')
  const { register } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { slug } = useParams<{ slug: string }>()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [inviteToken, setInviteToken] = useState(searchParams.get('token') ?? '')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError(t('register.passwordMismatch'))
      return
    }
    setError(null)
    setLoading(true)
    try {
      await register(username, password, inviteToken)
      router.replace(`/t/${slug}/dashboard`)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('register.failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">{t('register.title')}</CardTitle>
        <CardDescription>{t('register.description')}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="inviteToken">{t('register.inviteCode')}</Label>
            <Input
              id="inviteToken"
              type="text"
              placeholder={t('register.inviteCodePlaceholder')}
              value={inviteToken}
              onChange={(e) => setInviteToken(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">{t('register.username')}</Label>
            <Input
              id="username"
              type="text"
              placeholder={t('register.usernamePlaceholder')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('register.password')}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">{t('register.confirm')}</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t('register.submitting') : t('register.submit')}
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            {t('register.hasAccount')}{' '}
            <Link
              href={`/t/${slug}/login`}
              className="underline underline-offset-4 hover:text-primary"
            >
              {t('register.signIn')}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
