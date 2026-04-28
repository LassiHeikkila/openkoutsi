import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

const intlMiddleware = createMiddleware(routing)

// Protected path segments (without locale prefix)
const PROTECTED_PREFIXES = [
  '/dashboard', '/activities', '/power', '/records',
  '/goals', '/plan', '/profile', '/settings',
]

// Note: the httpOnly refresh_token cookie is set by the backend (different origin/port)
// so the edge runtime cannot read it directly. We use a lightweight non-sensitive
// "logged_in" indicator cookie (set below on login) to gate page rendering.
// The real security check always happens on the backend via JWT Bearer tokens.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Pass through Next.js internals, API routes, and static files immediately
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    /\.[\w]+$/.test(pathname)  // any path with a file extension (e.g. .svg, .png, .ico)
  ) {
    return NextResponse.next()
  }

  // Strip locale prefix to get the logical path for auth checks
  const locales = routing.locales as readonly string[]
  let logicalPath = pathname
  for (const locale of locales) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      logicalPath = pathname.slice(locale.length + 1) || '/'
      break
    }
  }

  // Gate protected pages on the presence of the session indicator cookie.
  // AuthProvider always tries a token refresh on mount as the true auth check.
  const hasSession = request.cookies.has('session')
  if (PROTECTED_PREFIXES.some((p) => logicalPath.startsWith(p)) && !hasSession) {
    const detectedLocale =
      locales.find((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`)) ??
      routing.defaultLocale
    const loginUrl = new URL(`/${detectedLocale}/login`, request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Let next-intl handle locale detection, root-/ redirect, and cookie persistence
  return intlMiddleware(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.\\w+$).*)'],
}
