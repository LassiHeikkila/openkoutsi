import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

const intlMiddleware = createMiddleware(routing)

// App-page suffixes that require auth (relative to /t/{slug}/)
const PROTECTED_SUFFIXES = [
  '/dashboard', '/activities', '/power', '/records',
  '/goals', '/plan', '/profile', '/settings',
]

// Auth-page suffixes that are public
const AUTH_SUFFIXES = ['/login', '/register', '/reset-password']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    /\.[\w]+$/.test(pathname)
  ) {
    return NextResponse.next()
  }

  const locales = routing.locales as readonly string[]
  let logicalPath = pathname
  let detectedLocale: string = routing.defaultLocale
  for (const locale of locales) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      logicalPath = pathname.slice(locale.length + 1) || '/'
      detectedLocale = locale
      break
    }
  }

  const hasSession = request.cookies.has('session')

  // Gate /t/{slug}/* app pages — public auth pages under /t/{slug}/ are excluded
  if (logicalPath.startsWith('/t/')) {
    const parts = logicalPath.slice(3).split('/') // strip leading /t/
    if (parts.length >= 2) {
      const slug = parts[0]
      const suffix = '/' + parts.slice(1).join('/')
      const isAuthPage = AUTH_SUFFIXES.some((s) => suffix.startsWith(s))
      const isProtected = PROTECTED_SUFFIXES.some((s) => suffix.startsWith(s))
      if (isProtected && !isAuthPage && !hasSession) {
        const loginUrl = new URL(`/${detectedLocale}/t/${slug}/login`, request.url)
        loginUrl.searchParams.set('next', pathname)
        return NextResponse.redirect(loginUrl)
      }
    }
  }

  return intlMiddleware(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.\\w+$).*)'],
}
