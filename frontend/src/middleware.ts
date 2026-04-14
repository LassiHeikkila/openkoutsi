import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/register']

// Note: the httpOnly refresh_token cookie is set by the backend (different origin/port)
// so the edge runtime cannot read it directly. We use a lightweight non-sensitive
// "logged_in" indicator cookie (set below on login) to gate page rendering.
// The real security check always happens on the backend via JWT Bearer tokens.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public routes and Next.js internals
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api')
  ) {
    return NextResponse.next()
  }

  // Gate protected pages on the presence of the session indicator cookie.
  // AuthProvider always tries a token refresh on mount as the true auth check.
  const hasSession = request.cookies.has('session')
  if (!hasSession) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
