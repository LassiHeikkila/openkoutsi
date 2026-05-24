import { getTranslations } from 'next-intl/server'
import Link from 'next/link'

export default async function NotFound() {
  const t = await getTranslations('common.notFound')

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-8 text-center">
      <div className="space-y-3 max-w-sm">
        <p className="text-6xl font-bold tracking-tight text-muted-foreground/40">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </div>

      <Link
        href="/"
        className="mt-2 px-4 py-2 rounded-md border text-sm font-medium hover:bg-muted transition-colors"
      >
        {t('home')}
      </Link>
    </div>
  )
}
