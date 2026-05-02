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

export default function LoginPage() {
  const t = useTranslations('auth')
  const { login } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { slug } = useParams<{ slug: string }>()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(username, password)
      const next = searchParams.get('next')
      if (next && next.startsWith('/')) {
        window.location.replace(next)
      } else {
        router.replace(`/t/${slug}/dashboard`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'Team pending approval') {
        setError(t('login.pendingApproval'))
      } else if (msg === 'Team access revoked') {
        setError(t('login.teamRevoked'))
      } else {
        setError(msg || t('login.failed'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">{t('login.title')}</CardTitle>
        <CardDescription>{t('login.description')}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="username">{t('login.username')}</Label>
            <Input
              id="username"
              type="text"
              placeholder={t('login.usernamePlaceholder')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('login.password')}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t('login.submitting') : t('login.submit')}
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            <Link
              href={`/t/${slug}/reset-password`}
              className="underline underline-offset-4 hover:text-primary"
            >
              {t('login.forgotPassword')}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
