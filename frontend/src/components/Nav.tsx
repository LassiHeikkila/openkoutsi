'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { Button } from './ui/button'
import { Activity, BarChart2, Target, Calendar, User, LogOut, Settings, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: BarChart2 },
  { href: '/activities', label: 'Activities', icon: Activity },
  { href: '/power', label: 'Power', icon: Zap },
  { href: '/goals', label: 'Goals', icon: Target },
  { href: '/plan', label: 'Plan', icon: Calendar },
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Nav() {
  const pathname = usePathname()
  const router = useRouter()
  const { athlete, logout } = useAuth()

  function handleLogout() {
    logout()
    router.replace('/login')
  }

  return (
    <nav className="flex flex-col h-full w-56 border-r bg-card px-3 py-4 gap-1">
      <div className="px-3 pb-4 mb-2 border-b">
        <p className="font-semibold text-lg leading-none">openkoutsi</p>
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
      <div className="flex-1 flex flex-col gap-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
              pathname.startsWith(href)
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="justify-start gap-3 text-muted-foreground"
        onClick={handleLogout}
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </Button>
    </nav>
  )
}
