import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/session';

// Server-side session gate (mirrors the Badho DaaS dashboard's proxy.ts).
// Every route except the login page and /api/auth/* requires a valid
// qps_session cookie. This protects the data API routes too — not just the UI.
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Always allow the login page, auth endpoints, and PWA/static assets
  // (manifest, service worker, icons, and any file with an extension).
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/auth/') ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/sw.js' ||
    pathname.startsWith('/icons/') ||
    /\.[a-z0-9]+$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(cookie);
  if (session) return NextResponse.next();

  // Unauthenticated. API routes get a clean 401; pages redirect to /login.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const loginUrl = new URL('/login', req.url);
  if (pathname !== '/') loginUrl.searchParams.set('next', pathname + search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
