import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Middleware for VEXA ai-tryon.
 *
 * Strategy:
 *  - /api/* routes used by the FIRST-PARTY frontend are authenticated via
 *    Supabase Bearer tokens (the frontend attaches the session access_token).
 *  - /api/* routes used by THIRD-PARTY marketplaces use x-vexa-key header
 *    (validated inside apiKeyMiddleware.ts at the route level).
 *  - /dashboard and /tryon pages require a logged-in user — redirected to /login.
 *
 * We do NOT block API routes here for first-party calls.  Auth is validated
 * inside each route handler so it can return proper JSON errors.
 */

// Paths that bypass ALL middleware checks (public / webhook)
const PUBLIC_API_PATHS = [
  '/api/webhook/',
  '/api/health',
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Always allow public/webhook paths
  if (PUBLIC_API_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // 2. API routes: allow through if they carry a Bearer token OR x-vexa-key.
  //    Actual validation happens inside each route handler.
  if (pathname.startsWith('/api/')) {
    const authHeader = request.headers.get('Authorization')
    const apiKey = request.headers.get('x-vexa-key')

    // Allow if either auth mechanism is present, or let through for
    // routes that handle their own auth (generate, tryon, upload, avatar, size)
    const firstPartyPaths = [
      '/api/tryon',
      '/api/avatar/',
      '/api/avatar/generate',
      '/api/upload',
      '/api/size',
      '/api/keys/',
    ]

    const isFirstParty = firstPartyPaths.some(p => pathname.startsWith(p))

    if (isFirstParty || authHeader?.startsWith('Bearer ') || apiKey) {
      return NextResponse.next()
    }

    // No auth at all — still let through; route handlers return 401
    return NextResponse.next()
  }

  // 3. Protected pages: /dashboard, /tryon — check for Supabase session cookie
  //    Skip in development to allow demo access
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/tryon')) {
    const isDev = process.env.NODE_ENV === 'development'
    
    if (!isDev) {
      // Production: require session cookie
      const supabaseCookies = request.cookies.getAll()
      const hasSession = supabaseCookies.some(c =>
        c.name.includes('sb-') && c.name.includes('-auth-token')
      )

      if (!hasSession) {
        const loginUrl = request.nextUrl.clone()
        loginUrl.pathname = '/login'
        loginUrl.searchParams.set('redirect', pathname)
        return NextResponse.redirect(loginUrl)
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*', '/tryon/:path*'],
}
