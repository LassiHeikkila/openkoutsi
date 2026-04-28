'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { Link, usePathname, useRouter } from '@/navigation'
import { useAuth } from '@/lib/auth'
import { Button } from './ui/button'
import { Activity, BarChart2, Target, Calendar, User, LogOut, Settings, Zap, Timer, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LocaleSwitcher } from './LocaleSwitcher'

interface NavInnerProps {
  onClose?: () => void
}

function NavInner({ onClose }: NavInnerProps) {
  const t = useTranslations('common')
  const pathname = usePathname()
  const router = useRouter()
  const { athlete, logout } = useAuth()

  const navItems = [
    { href: '/dashboard' as const, labelKey: 'nav.dashboard' as const, icon: BarChart2 },
    { href: '/activities' as const, labelKey: 'nav.activities' as const, icon: Activity },
    { href: '/power' as const, labelKey: 'nav.power' as const, icon: Zap },
    { href: '/records' as const, labelKey: 'nav.records' as const, icon: Timer },
    { href: '/goals' as const, labelKey: 'nav.goals' as const, icon: Target },
    { href: '/plan' as const, labelKey: 'nav.plan' as const, icon: Calendar },
    { href: '/profile' as const, labelKey: 'nav.profile' as const, icon: User },
    { href: '/settings' as const, labelKey: 'nav.settings' as const, icon: Settings },
  ]

  function handleLogout() {
    logout()
    router.replace('/')
  }

  return (
    <nav className="flex flex-col h-full w-56 border-r bg-card px-3 py-4 gap-1">
      <div className="px-3 pb-4 mb-2 border-b flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <img src="/logo.svg" alt="" aria-hidden="true" className="h-6 w-6" />
            <p className="font-semibold text-lg leading-none">openkoutsi</p>
          </div>
          {athlete && (
            <div className="flex items-center gap-2 mt-2">
              <div className="relative h-7 w-7 shrink-0 rounded-full overflow-hidden bg-muted border">
                {athlete.avatar_url ? (
                  <Image
                    src={athlete.avatar_url}
                    alt="Avatar"
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground select-none">
                    {athlete.name ? athlete.name.charAt(0).toUpperCase() : '?'}
                  </span>
                )}
              </div>
              {athlete.name && (
                <p className="text-xs text-muted-foreground truncate">{athlete.name}</p>
              )}
            </div>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 -mt-0.5 -mr-1 rounded text-muted-foreground hover:text-foreground"
            aria-label={t('nav.closeNavigation')}
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-1">
        {navItems.map(({ href, labelKey, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onClose}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
              pathname.startsWith(href)
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {t(labelKey)}
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between px-1 pt-1">
        <Button
          variant="ghost"
          size="sm"
          className="justify-start gap-3 text-muted-foreground"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          {t('nav.signOut')}
        </Button>
        <LocaleSwitcher />
      </div>
    </nav>
  )
}

interface NavProps {
  open?: boolean
  onClose?: () => void
}

export function Nav({ open = false, onClose }: NavProps) {
  return (
    <>
      {/* Desktop: always-visible sidebar */}
      <aside className="hidden md:flex h-full shrink-0">
        <NavInner />
      </aside>

      {/* Mobile: overlay drawer */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Drawer */}
          <aside className="fixed inset-y-0 left-0 z-50 flex md:hidden">
            <NavInner onClose={onClose} />
          </aside>
        </>
      )}
    </>
  )
}
