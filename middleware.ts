import { NextRequest, NextResponse } from 'next/server';

// JWT verification can't run in Edge Runtime (jsonwebtoken needs node).
// Middleware here only routes the request — the dashboard page itself
// performs the real auth check on mount (client-side, against localStorage).
// API routes are accessible so the dashboard can call them once the page
// has confirmed the user is logged in.
export function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
