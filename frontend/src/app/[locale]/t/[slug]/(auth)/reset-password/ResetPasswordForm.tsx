'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/navigation'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export function ResetPasswordForm() {
  const t = useTranslations('auth')
  const router = useRouter()
  const searchParams = useSearchParams()
  const { slug } = useParams<{ slug: string }>()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (!token) {
    const adminContact = process.env.NEXT_PUBLIC_ADMIN_CONTACT
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">{t('resetPassword.noTokenTitle')}</CardTitle>
          <CardDescription>{t('resetPassword.noTokenDesc')}</CardDescription>
        </CardHeader>
        {adminContact && (
          <CardContent>
            <p className="text-sm text-muted-foreground">{t('resetPassword.adminContact')}</p>
            <p className="text-sm font-medium mt-1">{adminContact}</p>
          </CardContent>
        )}
        <CardFooter>
          <Link
            href={`/t/${slug}/login`}
            className="text-sm underline underline-offset-4 hover:text-primary"
          >
            {t('resetPassword.backToSignIn')}
          </Link>
        </CardFooter>
      </Card>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError(t('resetPassword.passwordMismatch'))
      return
    }
    setError(null)
    setLoading(true)
    try {
      await apiFetch(
        `/api/teams/${slug}/auth/reset-password`,
        {
          method: 'POST',
          body: JSON.stringify({ token, new_password: password }),
        },
        false,
      )
      router.replace(`/t/${slug}/login`)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('resetPassword.failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">{t('resetPassword.setTitle')}</CardTitle>
        <CardDescription>{t('resetPassword.setDesc')}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="password">{t('resetPassword.newPassword')}</Label>
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
            <Label htmlFor="confirm">{t('resetPassword.confirm')}</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t('resetPassword.hint')}
          </p>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t('resetPassword.submitting') : t('resetPassword.submit')}
          </Button>
          <Link
            href={`/t/${slug}/login`}
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-primary"
          >
            {t('resetPassword.backToSignIn')}
          </Link>
        </CardFooter>
      </form>
    </Card>
  )
}
