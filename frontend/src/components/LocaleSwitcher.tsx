'use client'

import { useLocale } from 'next-intl'
import { usePathname, useRouter } from '@/navigation'
import { routing } from '@/i18n/routing'

export function LocaleSwitcher() {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()

  return (
    <div className="flex gap-1 text-xs font-medium">
      {routing.locales.map((l) => (
        <button
          key={l}
          onClick={() => router.replace(pathname, { locale: l })}
          className={`px-2 py-0.5 rounded border border-current transition-opacity ${
            l === locale
              ? 'opacity-100 font-semibold'
              : 'opacity-40 hover:opacity-75'
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
